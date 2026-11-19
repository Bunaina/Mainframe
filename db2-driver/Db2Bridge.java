import java.io.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;

/**
 * Persistent IBM Db2 for z/OS Type-4 JDBC Bridge for Node.js (HMS Mainframe Edition).
 * Communicates over stdin/stdout with single-line framed requests and JSON responses.
 */
public class Db2Bridge {
    private static String jdbcUrl;
    private static String dbUser;
    private static String dbPass;
    private static String dbSchema;
    private static Connection conn;

    public static void main(String[] args) throws Exception {
        String host = env("DB2_HOST", "204.90.115.200");
        String port = env("DB2_PORT", "5040");
        String database = env("DB2_DATABASE", "ZXPDB2");
        dbUser = env("DB2_USER", "Z72385");
        dbPass = env("DB2_PASSWORD", "");
        dbSchema = env("DB2_SCHEMA", dbUser).toUpperCase(Locale.ROOT);
        jdbcUrl = "jdbc:db2://" + host + ":" + port + "/" + database
                + ":currentSchema=" + dbSchema + ";retrieveMessagesFromServerOnGetMessage=true;";

        Class.forName("com.ibm.db2.jcc.DB2Driver");

        try {
            connect();
            String server = "";
            String sqlid = "";
            String product = conn.getMetaData().getDatabaseProductName() + " "
                    + conn.getMetaData().getDatabaseProductVersion();
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT CURRENT SERVER, CURRENT SQLID FROM SYSIBM.SYSDUMMY1")) {
                if (rs.next()) {
                    server = safeTrim(rs.getString(1));
                    sqlid = safeTrim(rs.getString(2));
                }
            }
            System.out.println("{\"ready\":true,\"server\":" + jsonStr(server)
                    + ",\"user\":" + jsonStr(sqlid)
                    + ",\"schema\":" + jsonStr(dbSchema)
                    + ",\"product\":" + jsonStr(product) + "}");
            System.out.flush();
        } catch (Exception e) {
            System.out.println("{\"ready\":false,\"error\":" + jsonStr(e.getMessage()) + "}");
            System.out.flush();
            System.exit(1);
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.trim().isEmpty()) continue;
            if ("EXIT".equals(line.trim())) break;
            String resp = handleRequest(line);
            System.out.println(resp);
            System.out.flush();
        }

        closeQuietly();
    }

    private static void connect() throws SQLException {
        closeQuietly();
        SQLException last = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                conn = DriverManager.getConnection(jdbcUrl, dbUser, dbPass);
                conn.setAutoCommit(true);
                return;
            } catch (SQLException e) {
                last = e;
                closeQuietly();
                if (attempt < 3) {
                    try { Thread.sleep(1000L * attempt); } catch (InterruptedException ignored) {}
                }
            }
        }
        throw last;
    }

    private static void ensureConnected() throws SQLException {
        if (conn == null || conn.isClosed()) {
            connect();
        }
    }

    private static void closeQuietly() {
        if (conn != null) {
            try { conn.close(); } catch (Exception ignored) {}
            conn = null;
        }
    }

    private static String handleRequest(String line) {
        String[] parts = line.split("\\|", -1);
        String reqId = parts.length > 0 ? parts[0] : "0";
        String op = parts.length > 1 ? parts[1] : "";
        String sql = parts.length > 2 && !parts[2].isEmpty() ? b64Decode(parts[2]) : "";

        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                ensureConnected();
                if ("PING".equals(op)) {
                    try (Statement st = conn.createStatement();
                         ResultSet rs = st.executeQuery("SELECT CURRENT SERVER FROM SYSIBM.SYSDUMMY1")) {
                        rs.next();
                        return "{\"id\":" + jsonStr(reqId) + ",\"ok\":true,\"server\":" + jsonStr(safeTrim(rs.getString(1))) + "}";
                    }
                }

                List<Param> params = parseParams(parts);

                if ("QUERY".equals(op)) {
                    try (PreparedStatement ps = conn.prepareStatement(sql)) {
                        bindParams(ps, params);
                        try (ResultSet rs = ps.executeQuery()) {
                            String rowsJson = resultSetToJson(rs);
                            return "{\"id\":" + jsonStr(reqId) + ",\"ok\":true,\"rows\":" + rowsJson + "}";
                        }
                    }
                } else if ("INSERT".equals(op)) {
                    boolean prevAuto = conn.getAutoCommit();
                    conn.setAutoCommit(false);
                    try (PreparedStatement ps = conn.prepareStatement(sql)) {
                        bindParams(ps, params);
                        int affected = ps.executeUpdate();
                        Long insertId = null;
                        try (Statement idSt = conn.createStatement();
                             ResultSet idRs = idSt.executeQuery("SELECT IDENTITY_VAL_LOCAL() FROM SYSIBM.SYSDUMMY1")) {
                            if (idRs.next()) {
                                Object val = idRs.getObject(1);
                                if (val != null) insertId = ((Number) val).longValue();
                            }
                        }
                        conn.commit();
                        return "{\"id\":" + jsonStr(reqId) + ",\"ok\":true,\"affected\":" + affected
                                + ",\"insertId\":" + (insertId == null ? "null" : insertId.toString()) + "}";
                    } catch (SQLException ex) {
                        try { conn.rollback(); } catch (Exception ignored) {}
                        throw ex;
                    } finally {
                        try { conn.setAutoCommit(prevAuto); } catch (Exception ignored) {}
                    }
                } else if ("EXEC".equals(op)) {
                    try (PreparedStatement ps = conn.prepareStatement(sql)) {
                        bindParams(ps, params);
                        int affected = ps.executeUpdate();
                        return "{\"id\":" + jsonStr(reqId) + ",\"ok\":true,\"affected\":" + affected
                                + ",\"insertId\":null}";
                    }
                } else if ("DDL".equals(op)) {
                    try (Statement st = conn.createStatement()) {
                        st.execute(sql);
                        return "{\"id\":" + jsonStr(reqId) + ",\"ok\":true}";
                    }
                } else {
                    return "{\"id\":" + jsonStr(reqId) + ",\"ok\":false,\"error\":\"Unknown operation\"}";
                }
            } catch (SQLException e) {
                int code = e.getErrorCode();
                // Retry once on transient connection drop (-4499, -4470, -30081)
                if (attempt == 0 && (code == -4499 || code == -4470 || code == -30081)) {
                    closeQuietly();
                    continue;
                }
                return "{\"id\":" + jsonStr(reqId) + ",\"ok\":false,\"sqlcode\":" + code
                        + ",\"sqlstate\":" + jsonStr(e.getSQLState())
                        + ",\"error\":" + jsonStr(e.getMessage()) + "}";
            } catch (Exception e) {
                return "{\"id\":" + jsonStr(reqId) + ",\"ok\":false,\"error\":" + jsonStr(e.getMessage()) + "}";
            }
        }
        return "{\"id\":" + jsonStr(reqId) + ",\"ok\":false,\"error\":\"Db2 request failed\"}";
    }

    private static class Param {
        String type;
        String value;
        Param(String t, String v) { type = t; value = v; }
    }

    private static List<Param> parseParams(String[] parts) {
        List<Param> list = new ArrayList<>();
        if (parts.length <= 3 || parts[3].isEmpty()) return list;
        int count = Integer.parseInt(parts[3]);
        for (int i = 0; i < count; i++) {
            String token = parts[4 + i];
            int colon = token.indexOf(':');
            String t = token.substring(0, colon);
            String v = colon + 1 < token.length() ? b64Decode(token.substring(colon + 1)) : "";
            list.add(new Param(t, v));
        }
        return list;
    }

    private static void bindParams(PreparedStatement ps, List<Param> params) throws SQLException {
        for (int i = 0; i < params.size(); i++) {
            Param p = params.get(i);
            int idx = i + 1;
            switch (p.type) {
                case "N":
                    ps.setNull(idx, Types.VARCHAR);
                    break;
                case "I":
                    ps.setInt(idx, Integer.parseInt(p.value));
                    break;
                case "L":
                    ps.setLong(idx, Long.parseLong(p.value));
                    break;
                case "D":
                    ps.setDouble(idx, Double.parseDouble(p.value));
                    break;
                default:
                    ps.setString(idx, p.value);
                    break;
            }
        }
    }

    private static String resultSetToJson(ResultSet rs) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int cols = md.getColumnCount();
        StringBuilder sb = new StringBuilder();
        sb.append('[');
        boolean firstRow = true;
        while (rs.next()) {
            if (!firstRow) sb.append(',');
            firstRow = false;
            sb.append('{');
            for (int c = 1; c <= cols; c++) {
                if (c > 1) sb.append(',');
                String colName = md.getColumnLabel(c).toLowerCase(Locale.ROOT);
                sb.append(jsonStr(colName)).append(':');
                int sqlType = md.getColumnType(c);
                Object val = rs.getObject(c);
                if (val == null) {
                    sb.append("null");
                } else if (sqlType == Types.INTEGER || sqlType == Types.SMALLINT || sqlType == Types.BIGINT) {
                    sb.append(((Number) val).longValue());
                } else if (sqlType == Types.DECIMAL || sqlType == Types.NUMERIC
                        || sqlType == Types.DOUBLE || sqlType == Types.FLOAT || sqlType == Types.REAL) {
                    sb.append(val.toString());
                } else if (sqlType == Types.CHAR) {
                    sb.append(jsonStr(val.toString().trim()));
                } else if (sqlType == Types.DATE || sqlType == Types.TIME || sqlType == Types.TIMESTAMP) {
                    sb.append(jsonStr(val.toString()));
                } else {
                    sb.append(jsonStr(val.toString()));
                }
            }
            sb.append('}');
        }
        sb.append(']');
        return sb.toString();
    }

    private static String b64Decode(String s) {
        return new String(Base64.getDecoder().decode(s), StandardCharsets.UTF_8);
    }

    private static String safeTrim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return (v == null || v.isEmpty()) ? def : v;
    }

    private static String jsonStr(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
            }
        }
        sb.append('"');
        return sb.toString();
    }
}
