
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
import os

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "change-this-local-dev-key")
DB_NAME = "tasks.db"


def connect_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with connect_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                priority TEXT DEFAULT 'Medium',
                due_date TEXT DEFAULT '',
                completed INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
            )
        """)


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Please log in"}), 401
            return redirect(url_for("login"))
        return func(*args, **kwargs)
    return wrapper


@app.route("/")
@login_required
def home():
    return render_template("index.html", username=session["username"])


@app.route("/register", methods=["GET", "POST"])
def register():
    error = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not username or not email or len(password) < 8:
            error = "Enter all details. Password must be at least 8 characters."
        else:
            try:
                with connect_db() as conn:
                    conn.execute(
                        "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
                        (username, email, generate_password_hash(password))
                    )
                return redirect(url_for("login"))
            except sqlite3.IntegrityError:
                error = "This email is already registered."

    return render_template("register.html", error=error)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = ""
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        with connect_db() as conn:
            user = conn.execute(
                "SELECT * FROM users WHERE email = ?", (email,)
            ).fetchone()

        if user and check_password_hash(user["password"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("home"))

        error = "Incorrect email or password."

    return render_template("login.html", error=error)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/api/tasks", methods=["GET"])
@login_required
def get_tasks():
    with connect_db() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC",
            (session["user_id"],)
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.route("/api/tasks", methods=["POST"])
@login_required
def add_task():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    description = str(data.get("description", "")).strip()
    priority = data.get("priority", "Medium")
    due_date = data.get("due_date", "")

    if not title:
        return jsonify({"error": "Task title is required"}), 400
    if priority not in ("Low", "Medium", "High"):
        return jsonify({"error": "Invalid priority"}), 400

    with connect_db() as conn:
        cur = conn.execute(
            """INSERT INTO tasks
               (user_id, title, description, priority, due_date)
               VALUES (?, ?, ?, ?, ?)""",
            (session["user_id"], title, description, priority, due_date)
        )
        task = conn.execute(
            "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
            (cur.lastrowid, session["user_id"])
        ).fetchone()

    return jsonify(dict(task)), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
@login_required
def update_task(task_id):
    data = request.get_json(silent=True) or {}

    with connect_db() as conn:
        task = conn.execute(
            "SELECT * FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, session["user_id"])
        ).fetchone()

        if not task:
            return jsonify({"error": "Task not found"}), 404

        title = str(data.get("title", task["title"])).strip()
        description = str(data.get("description", task["description"])).strip()
        priority = data.get("priority", task["priority"])
        due_date = data.get("due_date", task["due_date"])

        if not title:
            return jsonify({"error": "Task title is required"}), 400
        if priority not in ("Low", "Medium", "High"):
            return jsonify({"error": "Invalid priority"}), 400

        completed = data.get("completed", task["completed"])
        completed = 1 if completed else 0

        conn.execute(
            """UPDATE tasks SET title=?, description=?, priority=?,
               due_date=?, completed=?
               WHERE id=? AND user_id=?""",
            (title, description, priority, due_date, completed,
             task_id, session["user_id"])
        )
        updated = conn.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    return jsonify(dict(updated))


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@login_required
def delete_task(task_id):
    with connect_db() as conn:
        cur = conn.execute(
            "DELETE FROM tasks WHERE id = ? AND user_id = ?",
            (task_id, session["user_id"])
        )
        if cur.rowcount == 0:
            return jsonify({"error": "Task not found"}), 404

    return jsonify({"success": True})


# Initialize database when the application starts
init_db()

if __name__ == "__main__":
    app.run(debug=True)