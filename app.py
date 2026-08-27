import ast
import os

# Compatibility shim for Python 3.14+ when older Werkzeug/Flask packages still reference legacy AST node names.
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

from app import create_app, db
from app.models import User  # import models so tables are registered
from app.routes.init_db import seed_admin_users

app = create_app()

# Create tables and seed default admin users if they don't exist
with app.app_context():
    try:
        db.create_all()
        seed_admin_users()
    except Exception as exc:
        print(f"Database initialization notice: {exc}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
