from flask import Flask, render_template, request, redirect, url_for, session, flash, send_from_directory, jsonify, send_file, make_response
import pymysql.cursors
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
import os
import re
from flask_cors import CORS
import requests
from datetime import datetime
from flask_mail import Mail, Message
from werkzeug.utils import secure_filename
import json
from google_drive import get_folder_by_name, create_folder, upload_file, share_file_with_user

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="frontend")
app.config['SECRET_KEY'] = os.urandom(24).hex()
CORS(app, resources={r"/*": {"origins": "*"}})


app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.environ.get('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.environ.get('MAIL_PASSWORD')
app.config['MAIL_DEFAULT_SENDER'] = os.environ.get('MAIL_DEFAULT_SENDER') 
mail = Mail(app)


app.static_folder = 'frontend'


USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_]{8,30}$')
PASSWORD_PATTERN = re.compile(r'^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$')
EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')


def validate_input(username, password, email):
    if not USERNAME_PATTERN.match(username):
        return False, "Username must be 8-30 characters long and contain only letters, numbers, and underscores."
    if not PASSWORD_PATTERN.match(password):
        return False, "Password must be at least 8 characters long, include 1 uppercase letter, 1 number, and 1 special character."
    if not EMAIL_PATTERN.match(email):
        return False, "Invalid email format."
    return True, "Valid input."


def get_db_connection():
    try:
        print(f"Connecting to: {os.environ.get('SQL_HOST')}:{os.environ.get('SQL_PORT')}, DB: {os.environ.get('SQL_DATABASE')}")
        connection = pymysql.connect(
            host=os.environ.get("SQL_HOST"),
            user=os.environ.get("SQL_USER"),
            password=os.environ.get("SQL_PASSWORD"),
            database=os.environ.get("SQL_DATABASE"),
            port=int(os.environ.get("SQL_PORT")),
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=60,
            read_timeout=30,
            write_timeout=30 
        )
        print("Database connection successful!")
        return connection
    except pymysql.Error as e:
        print(f"Error connecting to the database: {e}")
        return None


@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role')
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    elif role == 'Main Stakeholder':
        return redirect(url_for('stakeholder_projects'))
    else:
        return redirect(url_for('dashboard'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')

        connection = get_db_connection()
        if connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM users WHERE Email=%s", (email,))
                user = cursor.fetchone()
                if user and check_password_hash(user['Password'], password):
                    session['user_id'] = user['UserID']
                    session['role'] = user['Role']
                    
                    if user['Role'] == 'Admin':
                        return redirect(url_for('admin_dashboard'))
                    elif user['Role'] == 'Main Stakeholder':
                        return redirect(url_for('stakeholder_projects'))
                    else:
                        return redirect(url_for('dashboard'))
                        
            flash('Invalid login credentials.')
            return render_template('login.html')
        else:
            flash('Database connection error.')
            return render_template('login.html')
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    role = session.get('role')
    user_id = session.get('user_id')
    
    stakeholder_info = session.pop('stakeholder_info', None)
    if stakeholder_info and role == 'Project Manager':
        for info in stakeholder_info:
            print(f"Main Stakeholder {info['name']} created with email: {info['email']} and password: {info['password']}")
    
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            if role == 'Project Manager':
                cursor.execute("SELECT * FROM projects WHERE ManagerID=%s AND Status='Approved'", (user_id,))
                approved_projects = cursor.fetchall()
                
                cursor.execute("SELECT * FROM projects WHERE ManagerID=%s AND Status='Not approved'", (user_id,))
                pending_projects = cursor.fetchall()
                
                return render_template('dashboard.html', 
                                    role=role, 
                                    approved_projects=approved_projects,
                                    pending_projects=pending_projects)

            elif role == 'Team Lead':
                cursor.execute("""
                    SELECT projects.* 
                    FROM projects 
                    JOIN teams ON FIND_IN_SET(teams.TeamID, projects.TeamIDs) > 0  # Use FIND_IN_SET for the comma-separated TeamIDs
                    JOIN users ON users.TeamID = teams.TeamID
                    WHERE users.UserID = %s AND users.Role = 'Team Lead'
                """, (user_id,))
                projects = cursor.fetchall()
                
        
                cursor.execute("SELECT TeamID FROM users WHERE UserID = %s", (user_id,))
                team_result = cursor.fetchone()
                team_id = team_result['TeamID'] if team_result else None
                
                team_members = []
                if team_id:
                    cursor.execute("""
                        SELECT UserID, Name, Email, Role 
                        FROM users 
                        WHERE TeamID = %s AND UserID != %s AND Role = 'Participant'
                    """, (team_id, user_id))
                    team_members = cursor.fetchall()
                
                return render_template('dashboard.html', role=role, projects=projects, 
                                       team_members=team_members, team_id=team_id)
            
            elif role == 'Main Stakeholder':
                cursor.execute("""
                    SELECT p.ProjectID, p.ProjectName, p.Status
                    FROM projects p
                    JOIN stakeholders s ON p.ProjectID = s.ProjectID
                    WHERE s.UserID = %s AND s.Type = 'Main'
                """, (user_id,))
                projects = cursor.fetchall()
                approved = [p for p in projects if p['Status'] == 'Approved']
                not_approved = [p for p in projects if p['Status'] == 'Not approved']
                return render_template('dashboard.html', role=role, approved_projects=approved, not_approved_projects=not_approved)

            else: 
           
                cursor.execute("""
                    SELECT teams.TeamID, teams.TeamName, projects.ProjectName, projects.ProjectID, projects.Description
                    FROM users
                    LEFT JOIN teams ON users.TeamID = teams.TeamID
                    LEFT JOIN projects ON FIND_IN_SET(teams.TeamID, projects.TeamIDs) > 0  # Use FIND_IN_SET here
                    WHERE users.UserID = %s
                """, (user_id,))
                team_project = cursor.fetchone()


                team_id = team_project['TeamID'] if team_project and 'TeamID' in team_project else None
                team_members = []
                if team_id:
                    cursor.execute(
                        "SELECT Name, Role FROM users WHERE TeamID = %s",
                        (team_id,)
                    )
                    team_members = cursor.fetchall()

                return render_template(
                    'dashboard.html',
                    role=role,
                    team_project=team_project,
                    team_members=team_members
                )

    return 'Database connection error'





@app.route('/create_project', methods=['GET', 'POST'])
def create_project():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        

    if role != 'Project Manager':
        return render_template('403.html'), 403

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT TeamID, TeamName FROM teams") 
            teams_data = cursor.fetchall()
            teams_dict = {}
            for team in teams_data:
                if 'TeamID' in team and 'TeamName' in team:
                    teams_dict[team['TeamName']] = team['TeamID'] 
                else:
                    print(f"Warning: Skipping team data with insufficient columns: {team}")

            cursor.execute("SELECT * FROM users WHERE Role='Project Manager'")
            project_managers = cursor.fetchall()

            cursor.execute("SELECT * FROM users")
            team_members = cursor.fetchall()
            
        
            cursor.execute("SELECT DISTINCT Name, Classification FROM stakeholders ORDER BY Name")
            all_stakeholders = cursor.fetchall()

        if request.method == 'POST':
            project_title = request.form['project_title']
            project_type = request.form.get('project_type') 
            description = request.form['description']
            start_date = request.form['start_date']
            end_date = request.form['end_date']
            manager_id = request.form['manager_id']
            objective = request.form.get('objective', '')  
            risks_issues = request.form.get('risks_issues', '')  
            financials = request.form.get('financials', '') 
            team_ids = request.form.getlist('team_ids')
            stakeholder_names = request.form.getlist('stakeholder_names[]')
            stakeholder_classifications = request.form.getlist('Stakeholder_classification[]')
            stakeholder_types = request.form.getlist('Stakeholder_Type[]')
            stakeholder_rank = request.form.getlist('Rank')

            team_ids_str = ",".join(team_ids)

            
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO projects (ProjectName, ManagerID, Description, StartDate, EndDate, Objective, RisksIssues, Financials, TeamIDs, ProjectType)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (project_title, manager_id, description, start_date, end_date, objective, risks_issues, financials, team_ids_str, project_type))
                connection.commit()

                project_id = cursor.lastrowid
                
             
                for team_id in team_ids:
                   
                    cursor.execute("""
                        SELECT t.TeamLeaderID, t.TeamName, u.Name as LeaderName
                        FROM teams t
                        JOIN users u ON t.TeamLeaderID = u.UserID
                        WHERE t.TeamID = %s
                    """, (team_id,))
                    team_info = cursor.fetchone()
                    
                    if team_info and team_info['TeamLeaderID']:
                        team_leader_id = team_info['TeamLeaderID']
                        team_name = team_info['TeamName']
                        
                       
                        chat_name = f"{project_title} - {team_name} Communication"
                        cursor.execute("""
                            INSERT INTO chats (ProjectID, Name)
                            VALUES (%s, %s)
                        """, (project_id, chat_name))
                        connection.commit()
                        
                        chat_id = cursor.lastrowid
                        
                        
                        cursor.execute("""
                            INSERT INTO chat_participants (ChatID, UserID)
                            VALUES (%s, %s)
                        """, (chat_id, manager_id))
                        
                        
                        cursor.execute("""
                            INSERT INTO chat_participants (ChatID, UserID)
                            VALUES (%s, %s)
                        """, (chat_id, team_leader_id))
                        
                        
                        cursor.execute("SELECT Name FROM users WHERE UserID = %s", (manager_id,))
                        pm_info = cursor.fetchone()
                        pm_name = pm_info['Name'] if pm_info else "Project Manager"
                        
                     
                        welcome_message = f"Welcome to the project communication channel for {project_title}. This chat is for coordination between {pm_name} (Project Manager) and the {team_name} team."
                        cursor.execute("""
                            INSERT INTO messages (ChatID, SenderID, Content)
                            VALUES (%s, %s, %s)
                        """, (chat_id, manager_id, welcome_message))
                        connection.commit()

         
                for name, classification, stakeholder_type, ranking in zip(stakeholder_names, stakeholder_classifications, stakeholder_types, stakeholder_rank):
           
                    cursor.execute("SELECT ID, UserID FROM stakeholders WHERE Name = %s", (name,))
                    existing_stakeholder = cursor.fetchone()
                    
                    if existing_stakeholder:
       
                        cursor.execute("""
                            INSERT INTO stakeholders (ProjectID, Name, Classification, Type, Rank, UserID)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (project_id, name, classification, stakeholder_type, ranking, 
                              existing_stakeholder['UserID'] if existing_stakeholder['UserID'] else None))
                    else:
                
                        cursor.execute("""
                            INSERT INTO stakeholders (ProjectID, Name, Classification, Type, Rank)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (project_id, name, classification, stakeholder_type, ranking))

                        if stakeholder_type == 'Main':
                            
                            default_email = f"{name.replace(' ', '_').lower()}@stakeholder.com"
                            cursor.execute("SELECT UserID FROM users WHERE Email = %s", (default_email,))
                            existing_user = cursor.fetchone()
                            
                            if existing_user:
                                stakeholder_user_id = existing_user['UserID']
                            else:
                           
                                default_password = "default"
                                hashed_password = generate_password_hash(default_password)
                                
                                cursor.execute("""
                                    INSERT INTO users (Name, Email, Password, Role)
                                    VALUES (%s, %s, %s, %s)
                                """, (name, default_email, hashed_password, 'Main Stakeholder'))
                                stakeholder_user_id = cursor.lastrowid

                          
                                if 'stakeholder_info' not in session:
                                    session['stakeholder_info'] = []
                                session['stakeholder_info'].append({
                                    'name': name,
                                    'email': default_email,
                                    'password': default_password
                                })

                            cursor.execute("""
                                UPDATE stakeholders
                                SET UserID = %s
                                WHERE ProjectID = %s AND Name = %s AND Type = 'Main'
                            """, (stakeholder_user_id, project_id, name))

                connection.commit()

            return redirect(url_for('dashboard'))

    return render_template('create_project.html', teams=teams_data, project_managers=project_managers, team_members=team_members, all_stakeholders=all_stakeholders)




@app.route('/edit_project/<int:project_id>', methods=['GET', 'POST'])
def edit_project(project_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))

    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        
   
    if role != 'Project Manager':
        return render_template('403.html'), 403

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            
            cursor.execute("SELECT * FROM projects WHERE ProjectID=%s AND ManagerID=%s", (project_id, session['user_id']))
            project = cursor.fetchone()
            
            if not project:
                flash("Project not found or unauthorized access.", "danger")
                return redirect(url_for('dashboard'))
            
        
            if project['ApprovalRequested']:
                flash("Cannot edit project while approval is pending.", "warning")
                return redirect(url_for('dashboard'))

            cursor.execute("SELECT * FROM teams")
            teams = cursor.fetchall()

            cursor.execute("SELECT * FROM users WHERE Role='Project Manager'")
            project_managers = cursor.fetchall()

            cursor.execute("SELECT * FROM stakeholders WHERE ProjectID=%s", (project_id,))
            stakeholders = cursor.fetchall()

            cursor.execute("SELECT * FROM milestones WHERE ProjectID=%s", (project_id,))
            milestones = cursor.fetchall()

            selected_team_ids = [team['TeamID'] for team in teams if str(team['TeamID']) in project['TeamIDs'].split(",")]

        if request.method == 'POST':
            project_title = request.form['project_title']
            project_type = request.form.get('project_type')  
            description = request.form['description']
            start_date = request.form['start_date']
            end_date = request.form['end_date']
            manager_id = request.form['manager_id']
            objective = request.form.get('objective', '')
            risks_issues = request.form.get('risks_issues', '')
            financials = request.form.get('financials', '')
            team_ids = request.form.getlist('team_ids')
            stakeholder_names = request.form.getlist('stakeholder_names[]')
            stakeholder_classifications = request.form.getlist('Stakeholder_classification[]')
            stakeholder_types = request.form.getlist('Stakeholder_Type[]')
            stakeholder_rank = request.form.getlist('Rank')
            milestones = request.form.getlist('milestone[]')
            milestone_start_dates = request.form.getlist('start_date[]')
            milestone_end_dates = request.form.getlist('completion_date[]')
            milestone_stakeholders = request.form.getlist('stakeholder_names_milestone[]')
            milestone_teams = request.form.getlist('teams_assigned[]')
            miletone_budget = request.form.getlist('budget[]')

            team_ids_str = ",".join(team_ids)

            with connection.cursor() as cursor:
                cursor.execute("""
                    UPDATE projects
                    SET ProjectName=%s, ManagerID=%s, Description=%s, StartDate=%s, EndDate=%s, Objective=%s, RisksIssues=%s, Financials=%s, TeamIDs=%s, ProjectType=%s, Status=%s
                    WHERE ProjectID=%s
                """, (project_title, manager_id, description, start_date, end_date, objective, risks_issues, financials, team_ids_str, project_type, 'Not approved', project_id))
                connection.commit()

                cursor.execute("DELETE FROM stakeholders WHERE ProjectID=%s", (project_id,))
                for name, classification, stakeholder_type, ranking in zip(stakeholder_names, stakeholder_classifications, stakeholder_types, stakeholder_rank):
                    
                    cursor.execute("SELECT ID, UserID FROM stakeholders WHERE Name = %s AND ProjectID != %s", (name, project_id))
                    existing_stakeholder = cursor.fetchone()
                    
                    if existing_stakeholder:
                      
                        cursor.execute("""
                            INSERT INTO stakeholders (ProjectID, Name, Classification, Type, Rank, UserID)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, (project_id, name, classification, stakeholder_type, ranking, 
                              existing_stakeholder['UserID'] if existing_stakeholder['UserID'] else None))
                    else:
                      
                        cursor.execute("""
                            INSERT INTO stakeholders (ProjectID, Name, Classification, Type, Rank)
                            VALUES (%s, %s, %s, %s, %s)
                        """, (project_id, name, classification, stakeholder_type, ranking))

                    if stakeholder_type == 'Main':
                        
                        default_email = f"{name.replace(' ', '_').lower()}@stakeholder.com"
                        cursor.execute("SELECT UserID FROM users WHERE Email = %s", (default_email,))
                        user = cursor.fetchone()

                        if not user:
                            
                            default_password = "default"
                            hashed_password = generate_password_hash(default_password)
                            cursor.execute("""
                                INSERT INTO users (Name, Email, Password, Role)
                                VALUES (%s, %s, %s, %s)
                            """, (name, default_email, hashed_password, 'Main Stakeholder'))
                            user_id = cursor.lastrowid
                            
                     
                            if 'stakeholder_info' not in session:
                                session['stakeholder_info'] = []
                            session['stakeholder_info'].append({
                                'name': name,
                                'email': default_email,
                                'password': default_password
                            })
                        else:
                            user_id = user['UserID']

                        cursor.execute("""
                            UPDATE stakeholders
                            SET UserID = %s
                            WHERE ProjectID = %s AND Name = %s AND Type = 'Main'
                        """, (user_id, project_id, name))


                cursor.execute("DELETE FROM milestones WHERE ProjectID=%s", (project_id,))
                for i in range(len(milestones)):
                    cursor.execute("""
                        INSERT INTO milestones (ProjectID, Description, StartDate, CompletionDate, Stakeholder, Teams, Budget)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """, (project_id, milestones[i], milestone_start_dates[i], milestone_end_dates[i],
                          milestone_stakeholders[i], milestone_teams[i], miletone_budget[i]))
                connection.commit()

            return redirect(url_for('dashboard'))

    return render_template('edit_project.html', project_id=project_id, project=project, 
                           teams=teams, project_managers=project_managers, 
                           stakeholders=stakeholders, milestones=milestones, selected_team_ids=selected_team_ids)



@app.route('/logout', methods=['GET', 'POST'])
def logout():
    if 'user_id' in session:
        flash('You have been successfully logged out.', 'success')
        session.pop('user_id', None)  
        session.pop('role', None)      
    return redirect(url_for('login'))  

@app.route('/project/<int:project_id>')
def view_project(project_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        

    if role not in ['Project Manager', 'Team Lead']:
        return render_template('403.html'), 403
        
    user_id = session.get('user_id')
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
           
            cursor.execute("SELECT * FROM projects WHERE ProjectID=%s", (project_id,))
            project = cursor.fetchone()

       
            cursor.execute("""
                SELECT t.TeamID, t.TeamName, t.TeamLeaderID, u.Name as LeaderName
                FROM teams t
                LEFT JOIN users u ON t.TeamLeaderID = u.UserID
                JOIN projects ON FIND_IN_SET(t.TeamID, projects.TeamIDs) > 0
                WHERE projects.ProjectID=%s
            """, (project_id,))
            teams = cursor.fetchall()

 
            cursor.execute("""
                SELECT Name, Classification, Type, Rank 
                FROM stakeholders
                WHERE ProjectID=%s
                ORDER BY Rank ASC   
            """, (project_id,))
            stakeholders = cursor.fetchall()

         
            if role == "Team Lead":
                cursor.execute("""
                    SELECT 1 
                    FROM teams t
                    JOIN projects p ON FIND_IN_SET(t.TeamID, p.TeamIDs) > 0
                    WHERE p.ProjectID = %s AND t.TeamLeaderID = %s
                """, (project_id, user_id))
                is_assigned = cursor.fetchone()

                if not is_assigned:
                    flash("You are not authorized to view this project.")
                    return redirect(url_for('dashboard'))

            return render_template('view_project.html', project=project, teams=teams, stakeholders=stakeholders)

    return 'Database connection error'


@app.route('/create_user', methods=['GET', 'POST'])
def create_user():
    if 'user_id' not in session or session.get('role') != 'Admin':
        return redirect(url_for('login'))

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            if request.method == 'POST':
                name = request.form['name']
                email = request.form['email']
                password = request.form['password']  
                role = request.form['role']

                if not EMAIL_PATTERN.match(email):
                    flash("Invalid email format.")
                    return render_template('admin_dashboard.html')
                if len(password) < 8:
                    flash("Password must be at least 8 characters long.")
                    return render_template('admin_dashboard.html')

                
                hashed_password = generate_password_hash(password)

                cursor.execute("""
                    INSERT INTO users (Name, Email, Password, Role)
                    VALUES (%s, %s, %s, %s)
                """, (name, email, hashed_password, role))
                connection.commit()
                flash('User created successfully!')
                return redirect(url_for('admin_dashboard'))
        return render_template('admin_dashboard.html')


@app.route('/create_team', methods=['POST'])
def create_team():
    if 'user_id' not in session or session.get('role') != 'Admin':
        return redirect(url_for('login'))

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT UserID, Name, Email FROM users WHERE Role='Team Lead' AND TeamID IS NULL")
            eligible_team_leads = cursor.fetchall()
            print("Eligible Team Leads:", eligible_team_leads)  

            if request.method == 'POST':
                team_name = request.form['team_name']
                team_leader_id = request.form['team_leader']
                participants = request.form.getlist('participants') 
                participant_cost = request.form['participant_cost']
                participant_currency = request.form['participant_currency']


                cursor.execute("""
                    INSERT INTO teams (TeamName, TeamLeaderID, Cost, Currency)
                    VALUES (%s, %s, %s, %s)
                """, (team_name, team_leader_id, participant_cost, participant_currency))
                connection.commit()

        
                new_team_id = cursor.lastrowid

                cursor.execute("""
                    UPDATE users
                    SET TeamID = %s
                    WHERE UserID = %s
                """, (new_team_id, team_leader_id))

            
                for participant_id in participants:
                    cursor.execute("""
                        UPDATE users
                        SET TeamID = %s, Cost = %s, Currency = %s
                        WHERE UserID = %s
                    """, (new_team_id, participant_cost, participant_currency, participant_id))

                connection.commit()
                
     
                create_team_chat = request.form.get('create_team_chat') == 'on'
                
                if create_team_chat:
               
                    cursor.execute("SELECT Name FROM users WHERE UserID = %s", (team_leader_id,))
                    team_leader = cursor.fetchone()
                    team_leader_name = team_leader['Name'] if team_leader else "Team Lead"
                    
                    
                    cursor.execute("DESCRIBE chats")
                    chat_columns = cursor.fetchall()
                    project_id_nullable = False
                    
                    for col in chat_columns:
                        if col['Field'] == 'ProjectID' and 'YES' in col.get('Null', ''):
                            project_id_nullable = True
                            break
                    

                    project_id = None
                    cursor.execute("""
                        SELECT ProjectID FROM projects 
                        WHERE TeamIDs IS NOT NULL 
                        LIMIT 1
                    """)
                    project = cursor.fetchone()
                    if project:
                        project_id = project['ProjectID']
                    
                
                    if project_id or project_id_nullable:
                        if project_id:
                            cursor.execute("""
                                INSERT INTO chats (ProjectID, Name)
                                VALUES (%s, %s)
                            """, (project_id, f"{team_name} Team Chat"))
                        else:
                            cursor.execute("""
                                INSERT INTO chats (Name)
                                VALUES (%s)
                            """, (f"{team_name} Team Chat",))
                        
                        connection.commit()
                        chat_id = cursor.lastrowid
                  
                        cursor.execute("""
                            INSERT INTO chat_participants (ChatID, UserID)
                            VALUES (%s, %s)
                        """, (chat_id, team_leader_id))
                        
                     
                        participants_names = []
              
                        for participant_id in participants:
                            cursor.execute("""
                                SELECT Name FROM users WHERE UserID = %s
                            """, (participant_id,))
                            
                            member = cursor.fetchone()
                            if member:
                           
                                cursor.execute("""
                                    INSERT INTO chat_participants (ChatID, UserID)
                                    VALUES (%s, %s)
                                """, (chat_id, participant_id))
                                
   
                                participants_names.append(member['Name'])
                        
                        connection.commit()
                        
 
                        if participants_names:
                            members_text = ", ".join(participants_names)
                            welcome_message = f"Welcome to the {team_name} team chat! This chat includes all team members: {members_text}. I'm {team_leader_name}, your team lead."
                        else:
                            welcome_message = f"Welcome to the {team_name} team chat! I'm {team_leader_name}, your team lead."
                        
             
                        cursor.execute("""
                            INSERT INTO messages (ChatID, SenderID, Content)
                            VALUES (%s, %s, %s)
                        """, (chat_id, team_leader_id, welcome_message))
                        connection.commit()
                
                flash('Team created successfully with all members assigned!', 'success')
                return redirect(url_for('admin_dashboard'))

    return render_template('admin_dashboard.html', eligible_team_leads=eligible_team_leads)


@app.route('/admin_dashboard')
def admin_dashboard():
    if 'user_id' not in session or session.get('role') != 'Admin':
        return redirect(url_for('login'))
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
    
            cursor.execute("""
                SELECT u.UserID, u.Name, u.Email, u.Role, u.TeamID, t.TeamName
                FROM users u
                LEFT JOIN teams t ON u.TeamID = t.TeamID
                ORDER BY u.TeamID, u.Role
            """)
            users = cursor.fetchall()

            cursor.execute("SELECT UserID, Name, Email FROM users WHERE Role='Team Lead' AND TeamID IS NULL")
            eligible_team_leads = cursor.fetchall()

            cursor.execute("SELECT UserID, Name, Email FROM users WHERE Role='Participant' AND TeamID IS NULL")
            eligible_participants = cursor.fetchall()

         
            cursor.execute("""
                SELECT t.TeamID, t.TeamName, t.TeamLeaderID,
                       u.Name as LeaderName, u.Email as LeaderEmail,
                       (SELECT COUNT(*) FROM users WHERE TeamID = t.TeamID) as MemberCount
                FROM teams t
                LEFT JOIN users u ON t.TeamLeaderID = u.UserID
            """)
            teams = cursor.fetchall()

    return render_template('admin_dashboard.html', 
                         users=users, 
                         eligible_team_leads=eligible_team_leads, 
                         eligible_participants=eligible_participants, 
                         teams=teams)



@app.route('/stakeholder_projects')  
def stakeholder_projects():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        

    if role != 'Main Stakeholder':
        return render_template('403.html'), 403
    
    user_id = session.get('user_id')
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
        
            cursor.execute("""
                SELECT p.ProjectID, p.ProjectName, p.Status
                FROM projects p
                JOIN stakeholders s ON p.ProjectID = s.ProjectID
                WHERE s.UserID = %s AND s.Type = 'Main'
            """, (user_id,))
            projects = cursor.fetchall()
         
            approved_projects = [p for p in projects if p['Status'] == 'Approved']
            not_approved_projects = [p for p in projects if p['Status'] == 'Not approved']
                    
      
        return render_template('dashboard.html', 
                             role=role, 
                             approved_projects=approved_projects, 
                             not_approved_projects=not_approved_projects)
    else:
        return "DB Connection Error"



@app.route('/stakeholder_view_project/<int:project_id>')
def stakeholder_view_project(project_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))

    role = session.get('role')
    
  
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        

    if role != 'Main Stakeholder':
        return render_template('403.html'), 403

    user_id = session['user_id']
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:

            cursor.execute("""
                SELECT 1 FROM stakeholders 
                WHERE ProjectID = %s AND UserID = %s AND Type = 'Main'
            """, (project_id, user_id))
            if not cursor.fetchone():
                flash("You are not authorized to view this project.")
                return redirect(url_for('dashboard'))

    
            cursor.execute("SELECT * FROM projects WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()

   
            cursor.execute("""
                SELECT teams.TeamName
                FROM teams
                JOIN projects ON FIND_IN_SET(teams.TeamID, projects.TeamIDs) > 0
                WHERE projects.ProjectID = %s
            """, (project_id,))
            teams = cursor.fetchall()

          
            cursor.execute("""
                SELECT Name, Classification, Type
                FROM stakeholders
                WHERE ProjectID = %s
            """, (project_id,))
            stakeholders = cursor.fetchall()

          
            try:
              
                response = requests.get(f'http://localhost:5555/api/tasks?project_id={project_id}')
                if response.status_code == 200:
                    tasks_with_costs = response.json()
                    
                  
                    cursor.execute("""
                        SELECT t.*, teams.TeamName
                        FROM tasks t
                        JOIN teams ON t.TeamID = teams.TeamID
                        WHERE t.ProjectID = %s
                    """, (project_id,))
                    mysql_tasks = cursor.fetchall()
                    
                    
                    tasks = []
                    for mongo_task in tasks_with_costs:
               
                        estimated_service_cost = 0
                        estimated_goods_cost = 0
                        if mongo_task.get('subtasks'):
                            for subtask in mongo_task['subtasks']:
                                if subtask.get('type') == 'Service' and subtask.get('service'):
                                    estimated_service_cost += subtask['service'].get('estimatedCost', 0)
                                elif subtask.get('type') == 'Good' and subtask.get('goods'):
                                    estimated_goods_cost += subtask['goods'].get('estimatedCost', 0)
                        
                    
                        task_dict = {
                            'Description': mongo_task.get('description', ''),
                            'estimated_service_cost': estimated_service_cost,
                            'estimated_goods_cost': estimated_goods_cost,
                            'total_estimated_cost': estimated_service_cost + estimated_goods_cost
                        }
                        tasks.append(task_dict)
                else:
                
                    tasks = [dict(task) for task in mysql_tasks]
            except Exception as e:
                print(f"Error fetching task costs: {e}")

                cursor.execute("""
                    SELECT t.*, teams.TeamName
                    FROM tasks t
                    JOIN teams ON t.TeamID = teams.TeamID
                    WHERE t.ProjectID = %s
                """, (project_id,))
                tasks = [dict(task) for task in cursor.fetchall()]

            return render_template('stakeholder_view_project.html', 
                                project=project, 
                                teams=teams, 
                                stakeholders=stakeholders,
                                tasks=tasks)

    return "Database connection error"


@app.route('/project/<int:project_id>/update_status', methods=['POST'])
def update_project_status(project_id):
    if 'user_id' not in session or session.get('role') != 'Main Stakeholder':
        return redirect(url_for('login'))

    new_status = request.form.get('status')

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:

            cursor.execute("""
                SELECT 1 FROM stakeholders 
                WHERE ProjectID = %s AND UserID = %s AND Type = 'Main'
            """, (project_id, session['user_id']))
            if not cursor.fetchone():
                flash("Unauthorized access.", "danger")
                return redirect(url_for('stakeholder_view_project', project_id=project_id))


            cursor.execute("""
                UPDATE projects SET Status = %s WHERE ProjectID = %s
            """, (new_status, project_id))
            connection.commit()
            print(f"Project status updated to '{new_status}'", "success")

    
    return redirect(url_for('dashboard'))

@app.route('/frontend/<path:path>')
def serve_frontend(path):
    return send_from_directory('frontend', path)


@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('frontend/css', filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('frontend/js', filename)

@app.route('/html/<path:filename>')
def serve_html(filename):
    return send_from_directory('frontend/html', filename)

@app.route('/task_view')
def task_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        
    project_id = request.args.get('project_id')
    if not project_id:
        return redirect(url_for('dashboard'))
    

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT ProjectID, ProjectName FROM projects WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            if not project:
                flash('Project not found')
                return redirect(url_for('dashboard'))
            

            cursor.execute("SELECT TeamID FROM users WHERE UserID = %s", (session['user_id'],))
            team = cursor.fetchone()
            if not team:
                flash('User not assigned to any team')
                return redirect(url_for('dashboard'))
            
            team_id = team['TeamID']
    

    response = make_response(send_from_directory('frontend/html', 'task_view.html'))
    response.set_cookie('project_id', project_id)
    response.set_cookie('team_id', str(team_id))
    return response

@app.route('/final.html', methods=['GET'])
def final_html():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    print(f'[DEBUG] User role from session: {role}') 
    
  
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    project_id = request.args.get('project_id')
    print(f'[Flask] Received request for project_id: {project_id}')
    
    if not project_id:
        print('[Flask] No project_id provided, redirecting to dashboard')
        return redirect(url_for('dashboard'))
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            print(f'[Flask] Checking MySQL for project_id: {project_id}')
            cursor.execute("SELECT ProjectID, ProjectName FROM projects WHERE ProjectID = %s", (project_id,))
            project = cursor.fetchone()
            if not project:
                print(f'[Flask] Project not found in MySQL: {project_id}')
                flash('Project not found')
                return redirect(url_for('dashboard'))
            print(f'[Flask] Found project in MySQL: {project}')
    

    with open('frontend/html/final.html', 'r') as file:
        html_content = file.read()
    
    html_content = html_content.replace('const userRole = "{{ role }}";', f'const userRole = "{role}";')
    print(f'[DEBUG] Setting userRole to: {role}')  

    response = make_response(html_content)
    response.set_cookie('project_id', project_id)
    return response

@app.route('/subtask.html', methods=['GET'])
def subtask_html():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    task_id = request.args.get('taskId')
    
  
    response = make_response(send_from_directory('frontend/html', 'subtask.html'))
    if task_id:
        response.set_cookie('task_id', task_id)
    return response

@app.route('/progress.html', methods=['GET'])
def progress_html():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
   
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    project_id = request.args.get('projectId')
    team_id = request.args.get('teamId')
    
    if not project_id or not team_id:
        flash('Missing project ID or team ID')
        return redirect(url_for('dashboard'))
    
  
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
  
            cursor.execute("SELECT TeamID FROM users WHERE UserID = %s", (session['user_id'],))
            team = cursor.fetchone()
            if not team:
                flash('User not assigned to any team')
                return redirect(url_for('dashboard'))
            
            user_team_id = team['TeamID']

            cursor.execute("""
                SELECT p.ProjectID, p.ProjectName 
                FROM projects p
                WHERE p.ProjectID = %s AND FIND_IN_SET(%s, p.TeamIDs) > 0
            """, (project_id, user_team_id))
            project = cursor.fetchone()
            
            if not project:
                flash('Project not found or you do not have access to it')
                return redirect(url_for('dashboard'))
    

    response = make_response(send_from_directory('frontend/html', 'team_progress_view.html'))
    response.set_cookie('project_id', project_id, path='/', samesite='Lax')
    response.set_cookie('team_id', team_id, path='/', samesite='Lax')
    return response

@app.route('/project/<int:project_id>/delete')
def delete_project(project_id):
    if 'user_id' not in session or session.get('role') != 'Project Manager':
        flash('Unauthorized access', 'error')
        return redirect(url_for('login'))

    try:
        response = requests.delete(f'http://localhost:5555/api/tasks?project_id={project_id}')
        if response.status_code != 200:
            app.logger.warning(f'Error deleting tasks from MongoDB: {response.status_code}')
    except Exception as e:
        app.logger.warning(f'Error connecting to task service: {e}')

    connection = get_db_connection()
    if connection:
        try:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM projects WHERE ProjectID = %s", (project_id,))
                connection.commit()
                flash('Project and all its tasks deleted successfully', 'success')
        except Exception as e:
            flash(f'Error deleting project: {str(e)}', 'error')
        finally:
            connection.close()
    
    return redirect(url_for('dashboard'))


@app.route('/chats', methods=['GET'])
def get_user_chats():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role')
    

    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    user_id = session.get('user_id')
    
   
    if session.get('new_team_chat'):
        session.pop('new_team_chat', None)
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
          
            cursor.execute("""
                SELECT c.ChatID, c.Name, c.ProjectID, c.CreatedAt, 
                       p.ProjectName,
                       (SELECT COUNT(*) FROM messages m 
                        WHERE m.ChatID = c.ChatID AND m.IsRead = FALSE AND m.SenderID != %s) as UnreadCount
                FROM chats c
                JOIN chat_participants cp ON c.ChatID = cp.ChatID
                LEFT JOIN projects p ON c.ProjectID = p.ProjectID
                WHERE cp.UserID = %s
                ORDER BY c.CreatedAt DESC
            """, (user_id, user_id))
            
            chats = cursor.fetchall()
            return render_template('chats.html', role=role, chats=chats)
    
    return 'Database connection error'

@app.route('/chat/<int:chat_id>', methods=['GET'])
def view_chat(chat_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    role = session.get('role')
    
   
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    user_id = session.get('user_id')
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
          
            cursor.execute("""
                SELECT 1 FROM chat_participants 
                WHERE ChatID = %s AND UserID = %s
            """, (chat_id, user_id))
            
            if not cursor.fetchone():
                flash("You don't have access to this chat")
                return redirect(url_for('get_user_chats'))
            
        
            cursor.execute("SELECT * FROM chats WHERE ChatID = %s", (chat_id,))
            chat = cursor.fetchone()
            
            cursor.execute("""
                SELECT u.UserID, u.Name, u.Role
                FROM users u
                JOIN chat_participants cp ON u.UserID = cp.UserID
                WHERE cp.ChatID = %s
            """, (chat_id,))
            participants = cursor.fetchall()
            
           
            last_message_id = request.args.get('last_id', 0, type=int)
            format_type = request.args.get('format')
            
            if format_type == 'json':
            
                cursor.execute("""
                    SELECT m.MessageID, m.Content, m.Timestamp, m.IsRead, 
                           u.UserID as SenderID, u.Name as SenderName
                    FROM messages m
                    JOIN users u ON m.SenderID = u.UserID
                    WHERE m.ChatID = %s AND m.MessageID > %s
                    ORDER BY m.Timestamp ASC
                """, (chat_id, last_message_id))
                messages = cursor.fetchall()
                
                cursor.execute("""
                    UPDATE messages
                    SET IsRead = TRUE
                    WHERE ChatID = %s AND SenderID != %s AND IsRead = FALSE
                """, (chat_id, user_id))
                connection.commit()
                
              
                for message in messages:
                    if isinstance(message['Timestamp'], datetime):
                        message['Timestamp'] = message['Timestamp'].isoformat()
                
                return jsonify({'messages': messages})
            else:
             
                cursor.execute("""
                    SELECT m.MessageID, m.Content, m.Timestamp, m.IsRead, 
                           u.UserID as SenderID, u.Name as SenderName
                    FROM messages m
                    JOIN users u ON m.SenderID = u.UserID
                    WHERE m.ChatID = %s
                    ORDER BY m.Timestamp ASC
                """, (chat_id,))
                messages = cursor.fetchall()
                
                
                cursor.execute("""
                    UPDATE messages
                    SET IsRead = TRUE
                    WHERE ChatID = %s AND SenderID != %s AND IsRead = FALSE
                """, (chat_id, user_id))
                connection.commit()
                
                return render_template('chat.html', chat=chat, role=role, messages=messages, participants=participants)
    
    return 'Database connection error'

@app.route('/chat/<int:chat_id>/send', methods=['POST'])
def send_message(chat_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    user_id = session.get('user_id')
    content = request.form.get('content')
    
    if not content:
        return jsonify({'error': 'Empty message'}), 400
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
     
            cursor.execute("""
                SELECT 1 FROM chat_participants 
                WHERE ChatID = %s AND UserID = %s
            """, (chat_id, user_id))
            
            if not cursor.fetchone():
                return jsonify({'error': 'Access denied'}), 403
            
       
            cursor.execute("""
                INSERT INTO messages (ChatID, SenderID, Content)
                VALUES (%s, %s, %s)
            """, (chat_id, user_id, content))
            connection.commit()
            
            return jsonify({'success': True}), 200
    
    return jsonify({'error': 'Database error'}), 500

@app.route('/project/<int:project_id>/create_chat', methods=['POST'])
def create_chat(project_id):
    if 'user_id' not in session or session.get('role') != 'Project Manager':
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    team_leader_id = request.form.get('team_leader_id')
    chat_name = request.form.get('chat_name')
    
    if not team_leader_id or not chat_name:
        flash('Missing required fields')
        return redirect(url_for('view_project', project_id=project_id))
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
   
            cursor.execute("""
                SELECT 1 FROM projects 
                WHERE ProjectID = %s AND ManagerID = %s
            """, (project_id, user_id))
            
            if not cursor.fetchone():
                flash('Unauthorized')
                return redirect(url_for('dashboard'))
            
       
            cursor.execute("""
                INSERT INTO chats (ProjectID, Name)
                VALUES (%s, %s)
            """, (project_id, chat_name))
            connection.commit()
            
            chat_id = cursor.lastrowid
         
            cursor.execute("""
                INSERT INTO chat_participants (ChatID, UserID)
                VALUES (%s, %s)
            """, (chat_id, user_id))
            
       
            cursor.execute("""
                INSERT INTO chat_participants (ChatID, UserID)
                VALUES (%s, %s)
            """, (chat_id, team_leader_id))
            connection.commit()
        
            cursor.execute("""
                INSERT INTO messages (ChatID, SenderID, Content)
                VALUES (%s, %s, %s)
            """, (chat_id, user_id, f"Welcome to the chat for {chat_name}!"))
            connection.commit()
            
            flash('Chat created successfully')
            return redirect(url_for('view_chat', chat_id=chat_id))
    
    return 'Database connection error'

@app.route('/team/<int:team_id>/create_team_chat', methods=['POST'])
def create_team_chat(team_id):
    if 'user_id' not in session or session.get('role') != 'Team Lead':
        return redirect(url_for('login'))
    
    user_id = session.get('user_id')
    chat_name = request.form.get('chat_name')
    selected_members = request.form.getlist('selected_members')
    
    if not chat_name:
        flash('Chat name is required')
        return redirect(url_for('dashboard'))
    
    if not selected_members:
        flash('Please select at least one team member for the chat')
        return redirect(url_for('dashboard'))
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
         
            cursor.execute("""
                SELECT 1 FROM teams 
                WHERE TeamID = %s AND TeamLeaderID = %s
            """, (team_id, user_id))
            
            if not cursor.fetchone():
                flash('You are not authorized to create chats for this team')
                return redirect(url_for('dashboard'))
            
          
            cursor.execute("""
                SELECT ProjectID FROM projects 
                JOIN teams ON FIND_IN_SET(teams.TeamID, projects.TeamIDs) > 0
                WHERE teams.TeamID = %s
                LIMIT 1
            """, (team_id,))
            project_result = cursor.fetchone()
            
            if not project_result:
                flash('Cannot create chat: Your team must be assigned to a project first')
                return redirect(url_for('dashboard'))
            
            project_id = project_result['ProjectID']
            
        
            cursor.execute("SELECT Name FROM users WHERE UserID = %s", (user_id,))
            team_leader = cursor.fetchone()
            team_leader_name = team_leader['Name'] if team_leader else "Team Lead"
            
          
            cursor.execute("""
                INSERT INTO chats (ProjectID, Name)
                VALUES (%s, %s)
            """, (project_id, chat_name))
            
            connection.commit()
            chat_id = cursor.lastrowid
            
         
            cursor.execute("""
                INSERT INTO chat_participants (ChatID, UserID)
                VALUES (%s, %s)
            """, (chat_id, user_id))
            

            selected_members_names = []
            
            
            for member_id in selected_members:
                
                cursor.execute("""
                    SELECT Name FROM users 
                    WHERE UserID = %s AND TeamID = %s
                """, (member_id, team_id))
                
                member = cursor.fetchone()
                if member:
                    
                    cursor.execute("""
                        INSERT INTO chat_participants (ChatID, UserID)
                        VALUES (%s, %s)
                    """, (chat_id, member_id))
                    
                    selected_members_names.append(member['Name'])
            
            connection.commit()
            
          
            if selected_members_names:
                members_text = ", ".join(selected_members_names)
                welcome_message = f"Welcome to the chat '{chat_name}'! This chat includes {members_text}. I'm {team_leader_name}, your team lead."
            else:
                welcome_message = f"Welcome to the chat '{chat_name}'! I'm {team_leader_name}, your team lead."
            
         
            cursor.execute("""
                INSERT INTO messages (ChatID, SenderID, Content)
                VALUES (%s, %s, %s)
            """, (chat_id, user_id, welcome_message))
            connection.commit()
            
            flash('Team chat created successfully')
            return redirect(url_for('view_chat', chat_id=chat_id))
    
    return 'Database connection error'


def get_unread_messages_count(user_id):
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count 
                FROM messages m
                JOIN chat_participants cp ON m.ChatID = cp.ChatID
                WHERE cp.UserID = %s AND m.SenderID != %s AND m.IsRead = FALSE
            """, (user_id, user_id))
            result = cursor.fetchone()
            return result['count'] if result else 0
    return 0


@app.route('/forgot_password', methods=['POST'])
def forgot_password():
    email = request.form.get('email', '')
    last_password = request.form.get('last_password', '')
    change_request = request.form.get('change_request') == 'on'
    
    if not email:
        flash('Please enter your email address', 'error')
        return redirect(url_for('login'))
        
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
          
            cursor.execute("SELECT * FROM users WHERE Email=%s", (email,))
            user = cursor.fetchone()
            
            if not user:
                flash('No account found with that email address', 'error')
                return redirect(url_for('login'))
            
            admin_email = os.environ.get('ADMIN_EMAIL')
            
            
            subject = 'Password Change Request' if change_request else 'Forgotten Password Request'
            
           
            body = f"""
            {'Password Change Request' if change_request else 'Password Reset Request'}:
            
            User ID: {user['UserID']}
            Name: {user['Name']}
            Email: {user['Email']}
            Role: {user['Role']}
            Last Password Remembered: {last_password}
            Request Type: {'Password change' if change_request else 'Forgotten password'}
            
            Please assist this user in {'changing' if change_request else 'resetting'} their password.
            """
            
            msg = Message(
                subject=subject,
                recipients=[admin_email],
                body=body
            )
            
            try:
                mail.send(msg)
                flash(f"{'Password change' if change_request else 'Password reset'} request sent. An administrator will contact you shortly.", 'success')
            except Exception as e:
                print(f"Error sending email: {e}")
                flash('Error sending request. Please try again later.', 'error')
                
    return redirect(url_for('login'))

@app.context_processor
def inject_unread_count():
    if 'user_id' in session:
        return {'unread_count': get_unread_messages_count(session['user_id'])}
    return {'unread_count': 0}

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(403)
def forbidden(e):
    return render_template('403.html'), 403

@app.errorhandler(500)
def server_error(e):
    return render_template('500.html'), 500


@app.route('/admin/reset_password', methods=['POST'])
def admin_reset_password():
    if 'user_id' not in session or session.get('role') != 'Admin':
        return render_template('403.html'), 403
        
    user_id = request.form.get('user_id')
    new_password = request.form.get('new_password')
    
    if not user_id or not new_password:
        flash('User ID and new password are required', 'error')
        return redirect(url_for('admin_dashboard'))
        
  
    if len(new_password) < 8:
        flash('Password must be at least 8 characters long', 'error')
        return redirect(url_for('admin_dashboard'))
        
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:

            cursor.execute("SELECT * FROM users WHERE UserID = %s", (user_id,))
            user = cursor.fetchone()
            
            if not user:
                flash('User not found', 'error')
                return redirect(url_for('admin_dashboard'))
                
            if user['Role'] == 'Admin' and user['UserID'] != session.get('user_id'):
                flash('You cannot reset another administrator\'s password', 'error')
                return redirect(url_for('admin_dashboard'))
            
            hashed_password = generate_password_hash(new_password)
            cursor.execute("UPDATE users SET Password = %s WHERE UserID = %s", (hashed_password, user_id))
            connection.commit()
            
            flash(f"Password for {user['Name']} ({user['Email']}) has been reset successfully", 'success')
            
    return redirect(url_for('admin_dashboard'))

@app.route('/subtask_view.html')
def subtask_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    
   
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
    
    task_id = request.args.get('taskId')
    if not task_id:
        return redirect(url_for('dashboard'))

    response = make_response(send_from_directory('frontend/html', 'subtask_view.html'))
    if task_id:
        response.set_cookie('task_id', task_id)
    return response

@app.route('/api/users/current')
def get_current_user():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    user_id = session.get('user_id')
    role = session.get('role')
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT UserID, Name, Email, Role, TeamID 
                FROM users 
                WHERE UserID = %s
            """, (user_id,))
            user = cursor.fetchone()
            
            if user:
                return jsonify({
                    'UserID': user['UserID'],
                    'Name': user['Name'],
                    'Email': user['Email'],
                    'Role': user['Role'],
                    'TeamID': user['TeamID']
                })
    
    return jsonify({'error': 'User not found'}), 404

@app.route('/team_lead_view.html')
def team_lead_view():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    role = session.get('role')
    
  
    if role == 'Admin':
        return redirect(url_for('admin_dashboard'))
        

    if role != 'Team Lead':
        flash('Access denied. Team Lead access required.')
        return redirect(url_for('dashboard'))
    
    project_id = request.args.get('projectId')
    if not project_id:
        flash('Project ID is required')
        return redirect(url_for('dashboard'))
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
   
            cursor.execute("SELECT TeamID FROM users WHERE UserID = %s", (session['user_id'],))
            team = cursor.fetchone()
            if not team:
                flash('User not assigned to any team')
                return redirect(url_for('dashboard'))
            
            team_id = team['TeamID']
          
            cursor.execute("""
                SELECT p.ProjectID, p.ProjectName 
                FROM projects p
                WHERE p.ProjectID = %s AND FIND_IN_SET(%s, p.TeamIDs) > 0
            """, (project_id, team_id))
            project = cursor.fetchone()
            
            if not project:
                flash('Project not found or you do not have access to it')
                return redirect(url_for('dashboard'))
    
 
    response = make_response(send_from_directory('frontend/html', 'team_lead_view.html'))
    response.set_cookie('project_id', project_id, path='/', samesite='Lax')
    response.set_cookie('team_id', str(team_id), path='/', samesite='Lax')
    return response

@app.route('/api/tasks/team/<int:team_id>/project/<int:project_id>')
def get_team_tasks(team_id, project_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    role = session.get('role')
    if role != 'Team Lead':
        return jsonify({'error': 'Access denied'}), 403
        
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 1 FROM users 
                WHERE UserID = %s AND TeamID = %s AND Role = 'Team Lead'
            """, (session['user_id'], team_id))
            if not cursor.fetchone():
                return jsonify({'error': 'Access denied'}), 403
                
            cursor.execute("""
                SELECT 1 FROM projects 
                WHERE ProjectID = %s AND FIND_IN_SET(%s, TeamIDs) > 0
            """, (project_id, team_id))
            if not cursor.fetchone():
                return jsonify({'error': 'Project not found or access denied'}), 404
    

    try:
        response = requests.get(f'http://localhost:5555/api/tasks?team_id={team_id}&project_id={project_id}')
        if response.status_code == 200:
            tasks = response.json()
            return jsonify(tasks)
        else:
            return jsonify({'error': 'Failed to fetch tasks'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/project/<int:project_id>/teams')
def get_project_teams(project_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    role = session.get('role')
    if role not in ['Project Manager', 'Team Lead']:
        return jsonify({'error': 'Access denied'}), 403
        
   
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            if role == 'Team Lead':
                cursor.execute("""
                    SELECT 1 
                    FROM teams t
                    JOIN projects p ON FIND_IN_SET(t.TeamID, p.TeamIDs) > 0
                    WHERE p.ProjectID = %s AND t.TeamLeaderID = %s
                """, (project_id, session['user_id']))
                is_assigned = cursor.fetchone()
                if not is_assigned:
                    return jsonify({'error': 'Access denied'}), 403
            
    
            cursor.execute("""
                SELECT t.TeamID, t.TeamName
                FROM teams t
                JOIN projects p ON FIND_IN_SET(t.TeamID, p.TeamIDs) > 0
                WHERE p.ProjectID = %s
            """, (project_id,))
            teams = cursor.fetchall()
            return jsonify(teams)
    
    return jsonify({'error': 'Database connection error'}), 500

@app.route('/api/projects/<int:project_id>')
def get_project(project_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
        
    role = session.get('role')
    if role not in ['Project Manager', 'Team Lead']:
        return jsonify({'error': 'Access denied'}), 403
    
    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            if role == 'Team Lead':
                cursor.execute("""
                    SELECT 1 
                    FROM teams t
                    JOIN projects p ON FIND_IN_SET(t.TeamID, p.TeamIDs) > 0
                    WHERE p.ProjectID = %s AND t.TeamLeaderID = %s
                """, (project_id, session['user_id']))
                is_assigned = cursor.fetchone()
                if not is_assigned:
                    return jsonify({'error': 'Access denied'}), 403
            

            cursor.execute("""
                SELECT ProjectID, ProjectName, Description, Status
                FROM projects
                WHERE ProjectID = %s
            """, (project_id,))
            project = cursor.fetchone()
            if project:
                return jsonify(project)
            return jsonify({'error': 'Project not found'}), 404
    
    return jsonify({'error': 'Database connection error'}), 500


@app.route('/project/<int:project_id>/request_approval', methods=['POST'])
def request_approval(project_id):
    if 'user_id' not in session or session.get('role') != 'Project Manager':
        return redirect(url_for('login'))

    connection = get_db_connection()
    if connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM projects WHERE ProjectID=%s AND ManagerID=%s", (project_id, session['user_id']))
            project = cursor.fetchone()
            if not project:
                flash("Unauthorized or project not found.", "danger")
                return redirect(url_for('dashboard'))

            cursor.execute("UPDATE projects SET ApprovalRequested=1 WHERE ProjectID=%s", (project_id,))
            connection.commit()
            flash("Approval request sent to stakeholder.", "success")
    return redirect(url_for('dashboard'))

@app.route('/project/<int:project_id>/budget', methods=['GET', 'POST'])
def project_budget(project_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    role = session.get('role')
   
    if role not in ['Project Manager', 'Team Lead', 'Main Stakeholder']:
        return render_template('403.html'), 403

    connection = get_db_connection()
    if not connection:
        return "Database connection error", 500
    if request.method == 'POST':
        base_budget = float(request.form.get('base_budget', 0))
        risk_allocation = float(request.form.get('risk_allocation', 0))
        final_budget = float(request.form.get('final_budget', 0))
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE projects SET BaseBudget=%s, RiskAllocation=%s, FinalBudget=%s WHERE ProjectID=%s",
                (base_budget, risk_allocation, final_budget, project_id)
            )
            connection.commit()
        return redirect(url_for('project_budget', project_id=project_id))
    
    try:
        response = requests.get(f'http://localhost:5555/api/tasks?project_id={project_id}')
        if response.status_code != 200:
            return f"Failed to fetch tasks for project {project_id}", 500
        tasks = response.json()
    except Exception as e:
        return f"Error connecting to task service: {str(e)}", 500

    total_estimated_cost = 0
    for task in tasks:
        if 'subtasks' in task and task['subtasks']:
            for subtask in task['subtasks']:
                if subtask['type'] == 'Service' and subtask.get('service'):
                    total_estimated_cost += subtask['service'].get('estimatedCost', 0)
                elif subtask['type'] == 'Good' and subtask.get('goods'):
                    total_estimated_cost += subtask['goods'].get('estimatedCost', 0)

    project_type = None
    if connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT BaseBudget, RiskAllocation, FinalBudget, ProjectType FROM projects WHERE ProjectID=%s",
                (project_id,)
            )
            row = cursor.fetchone()
            project_type = row.get('ProjectType') if row else None
    base_budget = row['BaseBudget'] if row and row['BaseBudget'] is not None else total_estimated_cost
    risk_allocation = row['RiskAllocation'] if row and row['RiskAllocation'] is not None else 0
    final_budget = row['FinalBudget'] if row and row['FinalBudget'] is not None else base_budget + risk_allocation
    return render_template(
        'budget_view.html',
        project_id=project_id,
        total_estimated_cost=total_estimated_cost,
        base_budget=base_budget,
        risk_allocation=risk_allocation,
        final_budget=final_budget,
        project_type=project_type
    )


@app.route('/upload_task_files', methods=['POST'])
def upload_task_files():
    project_id = request.form.get('project_id')
    task_id = request.form.get('task_id')
    if not project_id or not task_id:
        return jsonify({'error': 'project_id and task_id are required'}), 400
    files = request.files.getlist('files')
    uploaded = []

    project_folder_name = f"Project_{project_id}"
    project_folder_id = get_folder_by_name(project_folder_name)
    if not project_folder_id:
        project_folder_id = create_folder(project_folder_name)
    task_folder_name = f"Project_{project_id}_Task_{task_id}"
    task_folder_id = get_folder_by_name(task_folder_name)
    if not task_folder_id:
        task_folder_id = create_folder(task_folder_name, parent_folder_id=project_folder_id)

    for f in files:
        filename = secure_filename(f.filename)
        temp_path = os.path.join('/tmp', filename)
        f.save(temp_path)
        file_id = upload_file(temp_path, f.mimetype, folder_id=task_folder_id)
        os.remove(temp_path)
        uploaded.append({'filename': filename, 'file_id': file_id})
    conn = get_db_connection()
    editor_emails = set()
    viewer_emails = set()
    if conn:
        with conn.cursor() as cursor:

            cursor.execute("SELECT TeamIDs, ManagerID FROM projects WHERE ProjectID = %s", (project_id,))
            proj = cursor.fetchone() or {}
            team_ids_str = proj.get('TeamIDs', '')
            manager_id = proj.get('ManagerID')

            if manager_id:
                cursor.execute("SELECT Email FROM users WHERE UserID = %s", (manager_id,))
                mrow = cursor.fetchone()
                if mrow and mrow.get('Email'):
                    editor_emails.add(mrow['Email'])

            if team_ids_str:
                cursor.execute(
                    "SELECT DISTINCT TeamLeaderID FROM teams WHERE FIND_IN_SET(TeamID, %s)",
                    (team_ids_str,)
                )
                lead_ids = [r['TeamLeaderID'] for r in cursor.fetchall() if r.get('TeamLeaderID')]
                if lead_ids:
                    query = f"SELECT Email FROM users WHERE UserID IN ({','.join(['%s']*len(lead_ids))})"
                    cursor.execute(query, tuple(lead_ids))
                    for r in cursor.fetchall():
                        if r.get('Email'):
                            editor_emails.add(r['Email'])
     
            if team_ids_str:
                cursor.execute(
                    "SELECT Email FROM users WHERE FIND_IN_SET(TeamID, %s) AND Role NOT IN ('Project Manager','Team Lead')",
                    (team_ids_str,)
                )
                for r in cursor.fetchall():
                    if r.get('Email'):
                        viewer_emails.add(r['Email'])
            cursor.execute(
                "SELECT u.Email FROM stakeholders s JOIN users u ON s.UserID = u.UserID WHERE s.ProjectID = %s AND s.UserID IS NOT NULL",
                (project_id,)
            )
            for r in cursor.fetchall():
                if r.get('Email'):
                    viewer_emails.add(r['Email'])
        conn.close()

    for file_info in uploaded:
        fid = file_info['file_id']
        for email in editor_emails:
            try:
                share_file_with_user(fid, email, 'writer')
            except Exception as e:
                print(f"Error sharing file {fid} with {email} as writer: {e}")
        for email in viewer_emails:
            try:
                share_file_with_user(fid, email, 'reader')
            except Exception as e:
                print(f"Error sharing file {fid} with {email} as reader: {e}")
    return jsonify({'uploaded': uploaded})

@app.route('/api/project-timeline/projects')
def get_project_timeline_projects():
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    connection = get_db_connection()
    if not connection:
        return jsonify({'error': 'Database connection error'}), 500
    with connection.cursor() as cursor:
        role = session.get('role')
        if role == 'Project Manager':
            cursor.execute('SELECT ProjectID, ProjectName FROM projects WHERE ManagerID = %s AND Status = "Approved"', (session['user_id'],))
            projects = cursor.fetchall()
        else:
            cursor.execute('SELECT TeamID FROM users WHERE UserID = %s', (session['user_id'],))
            team = cursor.fetchone()
            if not team:
                return jsonify([]), 200
            team_id = team['TeamID']
            cursor.execute('SELECT p.ProjectID, p.ProjectName FROM projects p WHERE FIND_IN_SET(%s, p.TeamIDs) > 0 AND p.Status = "Approved"', (team_id,))
            projects = cursor.fetchall()
    return jsonify(projects)

@app.route('/api/project-timeline/tasks/<int:project_id>')
def get_project_timeline_tasks(project_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    try:
        response = requests.get(f'http://localhost:5555/api/tasks?project_id={project_id}')
        if response.status_code == 401:
            return jsonify({'error': 'Not authenticated'}), 401
        if not response.ok:
            return jsonify({'error': 'Failed to fetch tasks'}), 500
        tasks = response.json()
        return jsonify(tasks)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000)    