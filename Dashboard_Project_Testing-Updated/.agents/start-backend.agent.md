---
mode: agent
description: Start the Spring Boot backend for the dashboard app
---

Start the backend application from the workspace.

Steps:
1. Go to the backend folder.
2. Prompt for the database password and set it as an environment variable (do NOT hard-code the password in this file).
3. Start the Spring Boot server with the Maven wrapper.
4. Ensure PostgreSQL is running and the dashboard-db database exists.

Use these commands in PowerShell (you will be prompted to type the password; it is never stored in this file):
```powershell
cd backend
$env:DB_PASSWORD = Read-Host -Prompt 'Enter DB password'
.\mvnw.cmd spring-boot:run
```

The backend should run on port 8081.
