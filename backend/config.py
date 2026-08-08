import os
from datetime import timedelta
from dotenv import load_dotenv

# Load environment variables from .env file if available
load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'dev-jwt-secret-key-change-in-production'
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///hackathon.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES_MINUTES', 60)))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.environ.get('JWT_REFRESH_TOKEN_EXPIRES_DAYS', 7)))
    
    REDIS_URL = os.environ.get('REDIS_URL', '')
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*').split(',')
    
    FLASK_ENV = os.environ.get('FLASK_ENV', 'development')
    TESTING = os.environ.get('TESTING', 'False').lower() in ('true', '1', 't')
