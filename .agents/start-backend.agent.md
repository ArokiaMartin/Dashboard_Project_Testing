---
mode: agent
description: Start the Spring Boot backend for the dashboard app
---

Start the backend application from the workspace.

Steps:
1. Go to the backend folder.
2. Set the database password environment variable.
3. Start the Spring Boot server with the Maven wrapper.
4. Ensure PostgreSQL is running and the dashboard-db database exists.

Use these commands in PowerShell:
```powershell
cd backend
$env:DB_PASSWORD="qwerty"
.\mvnw.cmd spring-boot:run
```

The backend should run on port 8081.
