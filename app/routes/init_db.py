from app import db, create_app
from app.models import User
from sqlalchemy import inspect, text

def ensure_schema_updated():
    try:
        inspector = inspect(db.engine)
        if 'user' in inspector.get_table_names():
            columns = [c['name'] for c in inspector.get_columns('user')]
            if 'phone' not in columns:
                db.session.execute(text('ALTER TABLE user ADD COLUMN phone VARCHAR(20)'))
                db.session.commit()
        if 'issue' in inspector.get_table_names():
            issue_cols = [c['name'] for c in inspector.get_columns('issue')]
            if 'image_url' not in issue_cols:
                db.session.execute(text('ALTER TABLE issue ADD COLUMN image_url VARCHAR(300)'))
                db.session.commit()
    except Exception as exc:
        db.session.rollback()

def seed_admin_users():
    ensure_schema_updated()
    # Insert or update default admin accounts
    admin1_email = 'tagoorncc10@gmail.com'
    admin2_email = 'archanasenapathi63@gmail.com'

    # Admin 1
    admin1 = User.query.filter((User.email == admin1_email) | (User.username == 'admin1')).first()
    if not admin1:
        admin1 = User(username='admin1', email=admin1_email, role='admin')
        db.session.add(admin1)
    admin1.email = admin1_email
    admin1.set_password('Nani10@gmail.com')
    admin1.role = 'admin'

    # Admin 2
    admin2 = User.query.filter((User.email == admin2_email) | (User.username == 'admin2')).first()
    if not admin2:
        admin2 = User(username='admin2', email=admin2_email, role='admin')
        db.session.add(admin2)
    admin2.email = admin2_email
    admin2.set_password('44')
    admin2.role = 'admin'

    db.session.commit()
    print("[SUCCESS] Admin accounts seeded successfully!")

if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.create_all()
        seed_admin_users()
