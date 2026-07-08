@echo off
set "JAVA_HOME=C:\tools\jdk17\jdk-17.0.19+10"
set "PATH=%JAVA_HOME%\bin;C:\tools\maven\apache-maven-3.9.9\bin;%PATH%"
set "DB_USERNAME=postgres"
set "DB_PASSWORD=qwerty"
cd "%~dp0..\backend"
mvn spring-boot:run "-Dspring-boot.run.jvmArguments=-Dserver.port=8081 -Dspring.jpa.hibernate.ddl-auto=update"
