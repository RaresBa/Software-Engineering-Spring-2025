# STRICTLY FOR TESTING PURPOSES

import os
import pymysql.cursors
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash


load_dotenv()

password = "admin123"
hashed_password = generate_password_hash(password)
print(f"Generated password hash: {hashed_password}")


try:
    connection = pymysql.connect(
        host=os.environ.get("SQL_HOST"),
        user=os.environ.get("SQL_USER"),
        password=os.environ.get("SQL_PASSWORD"),
        database=os.environ.get("SQL_DATABASE"),
        port=int(os.environ.get("SQL_PORT")),
        cursorclass=pymysql.cursors.DictCursor
    )
    
    print("Connected to database successfully")
    
    with connection.cursor() as cursor:

        cursor.execute("DELETE FROM users WHERE Email=%s", ("admin@example.com",))
        

        sql = "INSERT INTO users (Name, Email, Password, Role) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, ("Admin User", "admin@example.com", hashed_password, "Admin"))
        
        connection.commit()
        
        cursor.execute("SELECT UserID, Name, Email, Role FROM users WHERE Email=%s", ("admin@example.com",))
        user = cursor.fetchone()
        print(f"Added user: {user}")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'connection' in locals() and connection.open:
        connection.close()
        print("Database connection closed") 