import ast

# Compatibility shim for Python 3.14+ when older Werkzeug/Flask packages still
# reference legacy AST node names.
if not hasattr(ast, 'Str'):
    class Str(ast.Constant):
        def __init__(self, s='', kind=None, **kwargs):
            super().__init__(value=s, kind=kind, **kwargs)

        @property
        def s(self):
            return self.value

        @s.setter
        def s(self, value):
            self.value = value

    ast.Str = Str

if not hasattr(ast, 'Num'):
    class Num(ast.Constant):
        def __init__(self, n=0, **kwargs):
            super().__init__(value=n, **kwargs)

        @property
        def n(self):
            return self.value

        @n.setter
        def n(self, value):
            self.value = value

    ast.Num = Num

if not hasattr(ast, 'NameConstant'):
    ast.NameConstant = ast.Constant

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from config import Config
import atexit

# -----------------------------
# Extensions
# -----------------------------
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
login_manager.login_view = 'auth.login'   # type: ignore[attr-defined]
login_manager.login_message_category = 'info'

# -----------------------------
# Application Factory
# -----------------------------
def create_app(config_class=Config):
    app = Flask(
        __name__,
        template_folder="../templates",  # global templates
        static_folder="../static"       # global static files
    )
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    # Automatic SQLite schema migration for zone_marking columns
    with app.app_context():
        try:
            from sqlalchemy import inspect, text
            inspector = inspect(db.engine)
            if 'zone_marking' in inspector.get_table_names():
                existing_cols = [c['name'] for c in inspector.get_columns('zone_marking')]
                with db.engine.begin() as conn:
                    if 'disaster_type' not in existing_cols:
                        conn.execute(text("ALTER TABLE zone_marking ADD COLUMN disaster_type VARCHAR(50) DEFAULT 'floods'"))
                    if 'description' not in existing_cols:
                        conn.execute(text("ALTER TABLE zone_marking ADD COLUMN description TEXT DEFAULT ''"))
        except Exception as mig_err:
            app.logger.warning('ZoneMarking schema check note: %s', mig_err)

    # Register blueprints
    from app.routes.main import bp as main_bp
    from app.routes.auth import bp as auth_bp
    from app.routes.services import bp as services_bp
    from app.routes.about import bp as about_bp
    from app.routes.viewmap import bp as viewmap_bp
    from app.routes.news import bp as news_bp
    from app.routes.weather import bp as weather_bp
    from app.routes.push import bp as push_bp
    from app.routes.api import bp as api_bp
    from app.routes.rainfall_api import bp as rainfall_api_bp
    from app.routes.wind_api import bp as wind_api_bp
    from app.routes.flood_api import bp as flood_api_bp
    from app.routes.landslide_api import bp as landslide_api_bp
    from app.routes.cyclone_api import bp as cyclone_api_bp, mosdac_asset_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(services_bp)
    app.register_blueprint(about_bp)
    app.register_blueprint(viewmap_bp)
    app.register_blueprint(news_bp)
    app.register_blueprint(weather_bp)
    app.register_blueprint(push_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(rainfall_api_bp)
    app.register_blueprint(wind_api_bp)
    app.register_blueprint(flood_api_bp)
    app.register_blueprint(landslide_api_bp)
    app.register_blueprint(cyclone_api_bp)
    app.register_blueprint(mosdac_asset_bp)

    @app.context_processor
    def inject_public_config():
        return {
            'vapid_public_key': app.config.get('VAPID_PUBLIC_KEY', ''),
            'weather_city': app.config.get('WEATHER_CITY', 'Guntur'),
        }

    # Initialize background scheduler for weather monitoring & disaster dataset updates
    from app.utils.weather_data import WeatherDataProcessor
    from app.utils.disaster_analytics import DisasterAnalyticsManager

    def fetch_weather_summary():
        with app.app_context():
            try:
                return WeatherDataProcessor.get_weather_summary()
            except Exception as exc:
                app.logger.warning('Weather monitoring job failed: %s', exc)
                return None

    def refresh_disaster_data_job():
        with app.app_context():
            try:
                DisasterAnalyticsManager.fetch_updated_datasets()
            except Exception as exc:
                app.logger.warning('Disaster dataset refresh job failed: %s', exc)

    def refresh_rainfall_job():
        """Daily IMD rainfall refresh + AI model retraining."""
        with app.app_context():
            try:
                from app.utils.rainfall_data import RainfallDataManager
                RainfallDataManager.fetch_all_rainfall_data()
            except Exception as exc:
                app.logger.warning('Rainfall IMD data refresh job failed: %s', exc)

    def retrain_rainfall_models_job():
        """Weekly LSTM/SARIMA retraining on the refreshed datasets."""
        with app.app_context():
            try:
                from app.utils.rainfall_ml import train_rainfall_models
                train_rainfall_models(force=True)
            except Exception as exc:
                app.logger.warning('Rainfall ML retraining job failed: %s', exc)

    def refresh_wind_job():
        """Daily IMD wind warnings + station nowcast refresh."""
        with app.app_context():
            try:
                from app.utils.wind_data import WindDataManager
                WindDataManager.fetch_all_wind_data()
            except Exception as exc:
                app.logger.warning('Wind IMD data refresh job failed: %s', exc)

    def retrain_wind_models_job():
        """Weekly wind hazard classifier + gust forecaster retraining."""
        with app.app_context():
            try:
                from app.utils.wind_ml import train_wind_models
                train_wind_models(force=True)
            except Exception as exc:
                app.logger.warning('Wind ML retraining job failed: %s', exc)

    def refresh_flood_job():
        """Daily flood discharge + IMD basin QPF refresh."""
        with app.app_context():
            try:
                from app.utils.flood_data import FloodDataManager
                FloodDataManager.fetch_all_flood_data()
            except Exception as exc:
                app.logger.warning('Flood data refresh job failed: %s', exc)

    def retrain_flood_models_job():
        """Weekly flood-risk classifier + discharge forecaster retraining."""
        with app.app_context():
            try:
                from app.utils.flood_ml import train_flood_models
                train_flood_models(force=True)
            except Exception as exc:
                app.logger.warning('Flood ML retraining job failed: %s', exc)

    def refresh_landslide_job():
        """Daily IMD rainfall + USGS seismic + NOAA/NCEI soil + DEM refresh."""
        with app.app_context():
            try:
                from app.utils.landslide_data import LandslideDataManager
                LandslideDataManager.fetch_all_landslide_data(force_refresh=True)
            except Exception as exc:
                app.logger.warning('Landslide data refresh job failed: %s', exc)

    def retrain_landslide_models_job():
        """Weekly landslide probability classifier retraining."""
        with app.app_context():
            try:
                from app.utils.landslide_ml import train_landslide_models
                train_landslide_models(force=True)
            except Exception as exc:
                app.logger.warning('Landslide ML retraining job failed: %s', exc)

    def refresh_cyclone_job():
        """5-minute real-time IMD cyclone track, wind warnings & COU sync."""
        with app.app_context():
            try:
                from app.utils.cyclone_data import CycloneDataManager
                CycloneDataManager.fetch_all_cyclone_data(force=True)
            except Exception as exc:
                app.logger.warning('Cyclone IMD live refresh job failed: %s', exc)

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=refresh_cyclone_job,
        trigger=IntervalTrigger(minutes=5),  # Check official IMD cyclone track/wind every 5 mins
        id='cyclone_live_refresh',
        name='5-Minute IMD Cyclone Real-Time Refresh',
        replace_existing=True
    )
    scheduler.add_job(
        func=fetch_weather_summary,
        trigger=IntervalTrigger(hours=1),  # Check every hour
        id='weather_monitor',
        name='Weather Monitoring Job',
        replace_existing=True
    )
    scheduler.add_job(
        func=refresh_disaster_data_job,
        trigger=IntervalTrigger(days=1),  # Daily refresh for IMD cyclone data & ML model retraining
        id='disaster_dataset_refresh',
        name='Daily IMD Cyclone Data Refresh & ML Retraining',
        replace_existing=True
    )
    scheduler.add_job(
        func=refresh_rainfall_job,
        trigger='cron', hour=6, minute=30,  # Daily 06:30 — fresh IMD rainfall + warnings + nowcast
        id='rainfall_daily_refresh',
        name='Daily IMD Rainfall APIs Refresh',
        replace_existing=True
    )
    scheduler.add_job(
        func=retrain_rainfall_models_job,
        trigger='cron', day_of_week='mon', hour=7, minute=0,  # Weekly LSTM/SARIMA retraining
        id='rainfall_model_retrain',
        name='Weekly Rainfall LSTM/SARIMA Model Retraining',
        replace_existing=True
    )
    scheduler.add_job(
        func=refresh_wind_job,
        trigger='cron', hour=6, minute=45,  # Daily 06:45 — fresh IMD wind warnings + nowcast
        id='wind_daily_refresh',
        name='Daily IMD Wind APIs Refresh',
        replace_existing=True
    )
    scheduler.add_job(
        func=retrain_wind_models_job,
        trigger='cron', day_of_week='mon', hour=7, minute=30,  # Weekly classifier/gust retraining
        id='wind_model_retrain',
        name='Weekly Wind Hazard Model Retraining',
        replace_existing=True
    )
    scheduler.add_job(
        func=refresh_flood_job,
        trigger='cron', hour=6, minute=45,  # Daily 06:45 — fresh discharge + basin QPF
        id='flood_daily_refresh',
        name='Daily Flood APIs Refresh (IMD + Open-Meteo + Google)',
        replace_existing=True
    )
    scheduler.add_job(
        func=retrain_flood_models_job,
        trigger='cron', day_of_week='mon', hour=7, minute=30,  # Weekly classifier/discharge retraining
        id='flood_model_retrain',
        name='Weekly Flood Risk Model Retraining',
        replace_existing=True
    )
    scheduler.add_job(
        func=refresh_landslide_job,
        trigger='cron', hour=6, minute=45,  # Daily 06:45 — fresh rainfall + seismic + soil inputs
        id='landslide_daily_refresh',
        name='Daily Landslide APIs Refresh (IMD + USGS + NOAA/NCEI + DEM)',
        replace_existing=True
    )
    scheduler.add_job(
        func=retrain_landslide_models_job,
        trigger='cron', day_of_week='mon', hour=7, minute=30,  # Weekly landslide classifier retraining
        id='landslide_model_retrain',
        name='Weekly Landslide Classifier Retraining',
        replace_existing=True
    )
    scheduler.start()

    # Shut down the scheduler when exiting the app
    atexit.register(lambda: scheduler.shutdown())

    return app

# -----------------------------
# User Loader for Flask-Login
# -----------------------------
from app.models import User  # Import after db is created

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
