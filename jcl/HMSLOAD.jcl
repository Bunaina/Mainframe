//HMSLOAD JOB (ACCT001),'HMS DB LOAD',
//        CLASS=A,MSGCLASS=X,MSGLEVEL=(1,1),
//        NOTIFY=&SYSUID,REGION=8M
//*
//* ============================================================
//* JCL JOB: HMSLOAD
//* PURPOSE: Load/Reload Hospital Management System DB2 Tables
//*          Run once to initialize or reload seed data
//* ============================================================
//*
//JOBLIB   DD  DSN=Z72385.CP.LOAD,DISP=SHR
//*
//* ---------------------------------------------------------
//* STEP 1: Drop and recreate tablespaces via DB2 BIND
//* ---------------------------------------------------------
//STEP010  EXEC PGM=IKJEFT01,DYNAMNBR=20
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSTSPRT DD  SYSOUT=*
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//SYSTSIN  DD  *
  DSN SYSTEM(DBDG)
  RUN PROGRAM(DSNTIAD) PLAN(DSNTIA11) -
      PARMS('/') LIB(DSND10.SDSNLOAD)
  END
/*
//DDLIN    DD  DSN=Z72385.CP.DDL(HMSDDL),DISP=SHR
//*
//* ---------------------------------------------------------
//* STEP 2: Load PATIENTS table
//* ---------------------------------------------------------
//STEP020  EXEC PGM=DSNUTILB,
//         COND=(4,LT,STEP010),
//         PARM='DBDG,HMSLOAD1'
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//SYSREC   DD  DSN=Z72385.CP.DATA.PATIENTS,DISP=SHR
//SYSIN    DD  *
  LOAD DATA INDDN(SYSREC)
    INTO TABLE Z72385.HMS_PATIENTS
    (PATIENT_ID  POSITION(1:8)    INTEGER,
     PAT_NAME    POSITION(9:63)   CHAR,
     PAT_AGE     POSITION(64:66)  SMALLINT,
     PAT_GENDER  POSITION(67:76)  CHAR,
     PAT_CONTACT POSITION(77:96)  CHAR,
     PAT_EMAIL   POSITION(97:156) CHAR,
     PAT_PASSWORD POSITION(157:216) CHAR)
    RESUME NO REPLACE
    LOG YES;
/*
//*
//* ---------------------------------------------------------
//* STEP 3: Load DOCTORS table
//* ---------------------------------------------------------
//STEP030  EXEC PGM=DSNUTILB,
//         COND=(4,LT,STEP020),
//         PARM='DBDG,HMSLOAD2'
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//SYSREC   DD  DSN=Z72385.CP.DATA.DOCTORS,DISP=SHR
//SYSIN    DD  *
  LOAD DATA INDDN(SYSREC)
    INTO TABLE Z72385.HMS_DOCTORS
    (DOCTOR_ID   POSITION(1:8)    INTEGER,
     DOC_NAME    POSITION(9:63)   CHAR,
     SPECIALIZ   POSITION(64:113) CHAR,
     DOC_EMAIL   POSITION(114:173) CHAR,
     DOC_PASSWORD POSITION(174:233) CHAR,
     DEPARTMENT  POSITION(234:283) CHAR,
     DOC_CONTACT POSITION(284:303) CHAR,
     DOC_STATUS  POSITION(304:313) CHAR)
    RESUME NO REPLACE
    LOG YES;
/*
//*
//* ---------------------------------------------------------
//* STEP 4: Check index validity after load
//* ---------------------------------------------------------
//STEP040  EXEC PGM=DSNUTILB,
//         COND=(4,LT,STEP030),
//         PARM='DBDG,HMSCHECK'
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//SYSIN    DD  *
  CHECK INDEX(ALL) TABLESPACE HMSDB.PATTSPC;
  CHECK INDEX(ALL) TABLESPACE HMSDB.DOCTSPC;
/*
//
