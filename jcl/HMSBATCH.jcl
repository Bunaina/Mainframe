//HMSBATCH JOB (ACCT001),'HMS BATCH PROC',
//         CLASS=B,MSGCLASS=X,MSGLEVEL=(1,1),
//         NOTIFY=&SYSUID,REGION=8M
//*
//* ============================================================
//* JCL JOB: HMSBATCH
//* PURPOSE: Hospital Management System - Master Batch Job
//*          Executes daily scheduled operations
//* SCHEDULE: Daily at 23:00 via JES2 SCHEDULER
//* ============================================================
//*
//JOBLIB   DD  DSN=Z72385.CP.LOAD,DISP=SHR
//*
//* ---------------------------------------------------------
//* STEP 1: DAILY APPOINTMENT SUMMARY REPORT
//* ---------------------------------------------------------
//STEP010  EXEC PGM=HMSRPT01,
//         PARM='DATE=TODAY,TYPE=APPT'
//STEPLIB  DD  DSN=Z72385.CP.LOAD,DISP=SHR
//SYSOUT   DD  SYSOUT=*
//SYSPRINT DD  SYSOUT=*
//RPTOUT   DD  DSN=Z72385.CP.RPT.APPT.D&DATE,
//             DISP=(NEW,CATLG,DELETE),
//             UNIT=SYSDA,
//             SPACE=(CYL,(5,2),RLSE),
//             DCB=(RECFM=FB,LRECL=133,BLKSIZE=13300)
//*
//* ---------------------------------------------------------
//* STEP 2: BILLING STATUS UPDATE
//* ---------------------------------------------------------
//STEP020  EXEC PGM=HMSBILL01,
//         COND=(4,LT,STEP010),
//         PARM='UPDATE=OVERDUE'
//STEPLIB  DD  DSN=Z72385.CP.LOAD,DISP=SHR
//SYSOUT   DD  SYSOUT=*
//SYSPRINT DD  SYSOUT=*
//BILLINP  DD  DSN=Z72385.CP.BILLING.INPUT,DISP=SHR
//BILLOUT  DD  DSN=Z72385.CP.BILLING.UPDATED.D&DATE,
//             DISP=(NEW,CATLG,DELETE),
//             UNIT=SYSDA,
//             SPACE=(CYL,(3,1),RLSE),
//             DCB=(RECFM=FB,LRECL=200,BLKSIZE=20000)
//*
//* ---------------------------------------------------------
//* STEP 3: PATIENT STATISTICS AGGREGATION
//* ---------------------------------------------------------
//STEP030  EXEC PGM=HMSSTAT01,
//         COND=(4,LT,STEP020),
//         PARM='PERIOD=DAILY'
//STEPLIB  DD  DSN=Z72385.CP.LOAD,DISP=SHR
//SYSOUT   DD  SYSOUT=*
//SYSPRINT DD  SYSOUT=*
//STATOUT  DD  DSN=Z72385.CP.STATS.DAILY.D&DATE,
//             DISP=(NEW,CATLG,DELETE),
//             UNIT=SYSDA,
//             SPACE=(CYL,(1,1),RLSE),
//             DCB=(RECFM=FB,LRECL=133,BLKSIZE=13300)
//*
//* ---------------------------------------------------------
//* STEP 4: DB2 RUNSTATS - Collect optimizer statistics
//* ---------------------------------------------------------
//STEP040  EXEC PGM=DSNUTILB,
//         COND=(4,LT,STEP030),
//         PARM='DBDG,HMSRSTATS'
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//SYSIN    DD  *
  RUNSTATS TABLESPACE HMSDB.APPTSPC
    TABLE(ALL)
    INDEX(ALL)
    SHRLEVEL CHANGE;
  RUNSTATS TABLESPACE HMSDB.PATTSPC
    TABLE(ALL)
    INDEX(ALL)
    SHRLEVEL CHANGE;
/*
//*
//* ---------------------------------------------------------
//* STEP 5: IMAGE COPY (Incremental Backup)
//* ---------------------------------------------------------
//STEP050  EXEC PGM=DSNUTILB,
//         COND=(4,LT,STEP040),
//         PARM='DBDG,HMSICOPY'
//STEPLIB  DD  DSN=DSND10.SDSNLOAD,DISP=SHR
//SYSPRINT DD  SYSOUT=*
//SYSUDUMP DD  SYSOUT=*
//COPYOUT1 DD  DSN=Z72385.CP.BACKUP.APPT.D&DATE,
//             DISP=(NEW,CATLG,DELETE),
//             UNIT=CART,
//             LABEL=(1,SL)
//COPYOUT2 DD  DSN=Z72385.CP.BACKUP.PAT.D&DATE,
//             DISP=(NEW,CATLG,DELETE),
//             UNIT=CART,
//             LABEL=(2,SL)
//SYSIN    DD  *
  COPY TABLESPACE HMSDB.APPTSPC
    COPYDDN(COPYOUT1)
    SHRLEVEL CHANGE
    INCREMENTAL YES;
  COPY TABLESPACE HMSDB.PATTSPC
    COPYDDN(COPYOUT2)
    SHRLEVEL CHANGE
    INCREMENTAL YES;
/*
//
