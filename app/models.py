from flask_login import UserMixin
from app import db
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

class User(UserMixin, db.Model):  # type: ignore
    id = db.Column(db.Integer, primary_key=True)  # type: ignore
    username = db.Column(db.String(50), unique=True, nullable=False)  # type: ignore
    email = db.Column(db.String(120), unique=True, nullable=False)  # type: ignore
    phone = db.Column(db.String(20), nullable=True)  # type: ignore
    password_hash = db.Column(db.String(128), nullable=False)  # type: ignore
    role = db.Column(db.String(20), default="user")  # type: ignore  # "admin" or "user"
    last_login = db.Column(db.DateTime, nullable=True)  # type: ignore

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def load_user(user_id): # type: ignore
        return User.query.get(int(user_id))

    @property
    def recent_reports(self):
        return len(self.issues)

class Issue(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.Text, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default='pending')
    timestamp = db.Column(db.DateTime, server_default=db.func.now())
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    image_url = db.Column(db.String(300), nullable=True)

    user = db.relationship('User', backref=db.backref('issues', lazy=True))

class News(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), default='general')
    source = db.Column(db.String(100), default='Guntur Municipal Corporation')
    is_flood_related = db.Column(db.Boolean, default=False)
    published_date = db.Column(db.DateTime, default=datetime.utcnow)
    image_url = db.Column(db.String(300), nullable=True)
    external_url = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'category': self.category,
            'source': self.source,
            'is_flood_related': self.is_flood_related,
            'published_date': self.published_date.isoformat() if self.published_date else None,
            'image_url': self.image_url,
            'external_url': self.external_url,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class PushSubscription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Optional: link to user if logged in
    endpoint = db.Column(db.String(500), nullable=False)
    p256dh = db.Column(db.String(200), nullable=False)
    auth = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship('User', backref=db.backref('push_subscriptions', lazy=True))

class ZoneMarking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    disaster_type = db.Column(db.String(50), nullable=False, default='floods')  # 'floods', 'cyclones', 'tsunamis', 'earthquakes', 'winds', 'rainfall', 'landslides'
    title = db.Column(db.String(100), default='Disaster Risk Zone')
    description = db.Column(db.Text, nullable=True, default='')                  # Advisory notes, evacuation guidance, or hazard details
    risk_level = db.Column(db.String(20), nullable=False, default='safe')         # 'safe', 'moderate', 'danger', 'severe'
    color = db.Column(db.String(20), nullable=False, default='green')              # 'green', 'yellow', 'red', 'purple', etc.
    shape_type = db.Column(db.String(20), nullable=False)                         # 'pencil', 'marker', 'polygon', 'circle', 'rectangle'
    geojson_data = db.Column(db.Text, nullable=False)                             # JSON string containing coordinates & properties
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    created_by = db.relationship('User', backref=db.backref('zone_markings', lazy=True))

    def to_dict(self):
        import json
        try:
            geo_data = json.loads(self.geojson_data) if self.geojson_data else {}
            if isinstance(geo_data, str):
                try:
                    geo_data = json.loads(geo_data)
                except Exception:
                    pass
        except Exception:
            geo_data = {}
            
        # Canonical disaster normalization
        raw_type = (self.disaster_type or 'floods').strip().lower()
        alias_map = {
            'cyclone': 'cyclones', 'cyclones': 'cyclones',
            'flood': 'floods', 'floods': 'floods',
            'tsunami': 'tsunamis', 'tsunamis': 'tsunamis',
            'earthquake': 'earthquakes', 'earthquakes': 'earthquakes',
            'wind': 'winds', 'winds': 'winds',
            'rainfall': 'rainfall', 'rain': 'rainfall',
            'landslide': 'landslides', 'landslides': 'landslides'
        }
        clean_type = alias_map.get(raw_type, raw_type)

        return {
            'id': self.id,
            'disaster_type': clean_type,
            'title': self.title,
            'description': self.description or '',
            'risk_level': self.risk_level,
            'color': self.color,
            'shape_type': self.shape_type,
            'geojson_data': geo_data,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by.username if self.created_by else 'Admin'
        }

class UserNotification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_read = db.Column(db.Boolean, default=False)

    user = db.relationship('User', backref=db.backref('notifications', lazy=True))
