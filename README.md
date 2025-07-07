# Software-Engineering-Spring-2025
Project for : CO-561-B Software Engineering Project

Contributers: Daria Solomon, Rares Baiasu, Timeea-Andreea Radu, Ioana Lupu, Nehir Altuntas, Paula Alvarez, Giovanni Sylvester Falconer, Jacob Asfaw, Flori Kusari, Robert-Theodor Ionescu, Dragos-Andrei Radu

A web-based project management system for tracking tasks, teams, and project progress.

## Prerequisites

- Node.js (v14 or higher)
- Python 3.x
- MariaDB/MySQL

## Setup

1. Clone the repository

2. Create and activate Python virtual environment:
```bash
python3 -m venv venv  # or python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Install Node.js dependencies:
```bash
npm install #Or Pull Node_Modules From Repository
```

5. Create a `.env` file in the root directory with:
```
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=budget
DB_PORT=3306

MAIL_USERNAME = "user@gmail.com"
MAIL_ADMIN = 'user@gmail.com'
MAIL_PASSWORD = "password"
MAIL_DEFAULT_SENDER = "user@gmail.com"
ADMIN_EMAIL = "user@gmail.com"


SECRET_KEY = 'Secret_Key'
```

6. Create a `.env` file in the backend directory with:
```
DB_HOST=localhost
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=budget
DB_PORT=3306

PORT=5555
MONGODB_URI=mongodb: MongoURI
GOOGLE_CALENDAR_CLIENT_ID= GOOGLE CALENDAR API
GOOGLE_CALENDAR_CLIENT_SECRET= GOOGLE CALENDAR API
GOOGLE_CALENDAR_REDIRECT_URI= Redirect Link


```

7. Create the database:
```bash
mysql -u your_username -p
CREATE SCHEMA budget;
exit;
mysql -u your_username -p budget < project_management_schema.sql
```

8. Create a Google Drive API Key in the Google Cloud Console

 - 1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
 - 2. Create a new OAuth 2.0 Client ID:
   -- Navigate to **APIs & Services** > **Credentials**.
   -- Click **Create Credentials** > **OAuth client ID**.
   -- Select **Application type** as **Desktop App**.
 - 3. Under the **OAuth consent screen** tab, set the user type to **External** (if not already set), and configure the required fields.
 - 4. Under the **Testing** section, add the email addresses of users who are allowed to test the application.
 - 5. Download the `credentials.json` file and place it as shown below in the folder structure.
 - 6. When you first run the app and complete the authentication, a token.json should be created and stored in the correct directory automatically as shown below in the folder structure.


9. Create default admin user:
```bash
python3 create_admin.py # Or python create_admin.py
```

## Running the Application

1. Start the Node.js backend server:
```bash
cd backend
node server.js
```

2. In a new terminal, start the Flask application:
```bash
# Make sure you're in the virtual environment
source venv/bin/activate  # On Windows use: venv\Scripts\activate
python3 app.py # python app.py or flask run also work
```

The application will be available at `http://localhost:5000`

## Features

- User authentication and authorization
- Project management
- Task tracking
- Team management
- Budget tracking
- Progress monitoring
- Subtask management
- Cost tracking for services and goods
- Google Drive API Integration
- Google Calendar API Integration
- Risk Assessment Model using Machine Learning
- Forgot Password Secure Authentication
- Chatting Feature using self-made chatting service.
- Gantt Chart Showcasing Task Concurrency and Sequentiality

## Project Structure
```
PM/
├── backend/
│   ├── routes/
│   │   ├── tasks.js
│   ├── models/
│   │   ├── Task.js
│   ├── node_modules/
│   ├── server.js
│   └── .env
├── frontend/
│   ├── css/
│   ├── js/
│   └── images/
├── templates/
├── venv/
├── app.py
├── create_admin.py
├── requirements.txt
├── project_management_schema.sql
├── google_drive.py
├── credentials.json
├── token.json
└── .env
```
