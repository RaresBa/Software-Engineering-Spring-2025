import os
# from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


SCOPES = ["https://www.googleapis.com/auth/drive.file"]

def authenticate_google_drive():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
        creds = flow.run_local_server(port=0)

        with open("token.json", "w") as token:
            token.write(creds.to_json())

    return creds

authenticate_google_drive()

def list_drive_files():
    creds = authenticate_google_drive()
    service = build("drive", "v3", credentials=creds)

    results = service.files().list(pageSize=10, fields="files(id, name)").execute()
    items = results.get("files", [])

    if not items:
        print("No files found.")
    else:
        for item in items:
            print(f"{item['name']} ({item['id']})")

def upload_file(file_path, mime_type, folder_id=None):
    """Uploads a file to Google Drive, optionally to a specific folder."""
    creds = authenticate_google_drive()
    service = build("drive", "v3", credentials=creds)

    file_metadata = {"name": os.path.basename(file_path)}
    
    if folder_id:
        file_metadata["parents"] = [folder_id]
    
    media = MediaFileUpload(file_path, mimetype=mime_type)

    file = service.files().create(body=file_metadata, media_body=media, fields="id").execute()
    print(f"File uploaded to Drive: {os.path.basename(file_path)} with ID {file['id']}")
    return file['id']

def create_folder(folder_name, parent_folder_id=None):
    """Creates a folder in Google Drive, optionally within another folder."""
    creds = authenticate_google_drive()
    service = build("drive", "v3", credentials=creds)
    
    file_metadata = {
        'name': folder_name,
        'mimeType': 'application/vnd.google-apps.folder'
    }
    

    if parent_folder_id:
        file_metadata['parents'] = [parent_folder_id]
    
    folder = service.files().create(body=file_metadata, fields='id').execute()
    print(f"Created folder: {folder_name} with ID {folder['id']}")
    return folder['id']

def get_folder_by_name(folder_name):
    """Find a folder by name, return its ID or None if not found."""
    creds = authenticate_google_drive()
    service = build("drive", "v3", credentials=creds)
    
    query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    items = results.get('files', [])
    
    if items:
        return items[0]['id']
    return None

def share_file_with_user(file_id, user_email, role='reader'):
    """Shares a file or folder with a specific user."""
    creds = authenticate_google_drive()
    service = build("drive", "v3", credentials=creds)
    
    permission = {
        'type': 'user',
        'role': role,
        'emailAddress': user_email
    }
    
    try:
        result = service.permissions().create(
            fileId=file_id,
            body=permission,
            fields='id',
            sendNotificationEmail=True
        ).execute()
        print(f"Shared file/folder with {user_email} (role: {role})")
        return result['id']
    except Exception as e:
        print(f"Error sharing with {user_email}: {str(e)}")
        return None

def create_team_folder(team_name, team_id):
    """Creates a folder for a team if it doesn't exist."""

    team_folder_name = f"Team_{team_id}_{team_name}"
    team_folder_id = get_folder_by_name(team_folder_name)
    
    if team_folder_id:
        print(f"Team folder already exists: {team_folder_name}")
        return team_folder_id
    

    team_folder_id = create_folder(team_folder_name)
    print(f"Created new team folder: {team_folder_name}")
    return team_folder_id

def create_task_folder(task_name, team_name, team_id, admin_emails, team_member_emails):
    """Creates a folder for a task within the team folder and gives access to admins and team members."""

    team_folder_id = create_team_folder(team_name, team_id)
    

    task_folder_name = f"Task_{task_name}"
    task_folder_id = create_folder(task_folder_name, team_folder_id)

    for email in admin_emails:
        share_file_with_user(task_folder_id, email, 'writer')
    
    for email in team_member_emails:
        share_file_with_user(task_folder_id, email, 'reader')
    
    return task_folder_id

def upload_task_file(file_path, mime_type, folder_id):
    """Upload a file to a task folder."""
    file_id = upload_file(file_path, mime_type, folder_id)
    return file_id

