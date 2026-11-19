//HMSQRY   JOB (ACCT),'HMS DB2 QUERY',CLASS=A,MSGCLASS=H,
//         MSGLEVEL=(1,1),NOTIFY=&SYSUID,REGION=0M
//*
//* ============================================================
//* JCL JOB: Z72385.CP.JCL(HMSQRY)
//* PURPOSE: Query all live HMS Db2 tables in ZXPDB2 (DBDG)
//* USAGE:   In Zowe Explorer -> Right-click HMSQRY -> Submit Job
//*          Open STDOUT in the Jobs panel to inspect live data!
//* ============================================================
//*
//QUERY    EXEC PGM=BPXBATCH
//STDOUT   DD  SYSOUT=*
//STDERR   DD  SYSOUT=*
//STDPARM  DD  *
SH export JAVA_HOME=/usr/lpp/java/J17.0_64;
   export PATH=$JAVA_HOME/bin:/bin:/usr/bin;
   J1=/usr/lpp/db2d10/base/lib/clp.jar;
   J2=/usr/lpp/db2d10/jdbc/classes/db2jcc4.jar;
   export CLASSPATH=$J1:$J2;
   export CLPPROPERTIESFILE=/usr/lpp/db2d10/base/samples/clp.properties;
   TMP=/tmp/hmsqry_$$.sql;
   cp "//'Z72385.CP.SQL(VIEWALL)'" "$TMP";
   java -Xmx256m com.ibm.db2.clp.db2 -t -f "$TMP";
   RC=$?;
   rm -f "$TMP";
   exit $RC
/*
