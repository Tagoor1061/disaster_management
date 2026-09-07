import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

basedir = os.path.abspath(os.path.dirname(__file__))

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-here')

    # Always use absolute path to instance/guntur.db so the database is always consistent
    instance_dir = os.path.join(basedir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_file = os.path.join(instance_dir, 'guntur.db')

    raw_db_url = os.getenv('DATABASE_URL')
    if raw_db_url and raw_db_url.startswith('postgres://'):
        raw_db_url = raw_db_url.replace('postgres://', 'postgresql://', 1)

    SQLALCHEMY_DATABASE_URI = raw_db_url or f'sqlite:///{db_file}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # External service keys. Keep real values in .env, not in source control.
    NEWS_API_KEY = os.getenv('NEWS_API_KEY', 'ec55f5b477c64bc193309f58a060e03e')
    OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY', '')
    WEATHER_LATITUDE = float(os.getenv('WEATHER_LATITUDE', '16.3067'))
    WEATHER_LONGITUDE = float(os.getenv('WEATHER_LONGITUDE', '80.4365'))
    WEATHER_CITY = os.getenv('WEATHER_CITY', 'Guntur')

    # Official Meteorological & Satellite APIs
    IMD_EMAIL = os.getenv('IMD_EMAIL', '')
    IMD_PASSWORD = os.getenv('IMD_PASSWORD', '')
    IMD_API_KEY = os.getenv('IMD_API_KEY', '')
    MOSDAC_API_KEY = os.getenv('MOSDAC_API_KEY', '')
    MOSDAC_USERNAME = os.getenv('MOSDAC_USERNAME', '')
    MOSDAC_PASSWORD = os.getenv('MOSDAC_PASSWORD', '')

    # Web Push VAPID keys. Generate these for each deployment.
    VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '')
    VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY', '')
    VAPID_CLAIMS = {
        'sub': os.getenv('VAPID_CONTACT', 'mailto:admin@gunturmunicipal.com')
    }

    # Mail Server Configuration
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', '587'))
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD', '')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER', 'Guntur Municipal Corporation <info@municipalcorporation.gov>')
