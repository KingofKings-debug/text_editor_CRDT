import os
from app import app
from models import db, User, Event, Team, TeamMember, Submission, Enrollment
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta

def seed_db():
    with app.app_context():
        # Clear existing data for cleanly re-seeding if needed, but we'll just check if exists
        
        users_data = [
            {"username": "org1", "email": "org1@test.com", "role": "Organizer"},
            {"username": "part1", "email": "part1@test.com", "role": "Participant"},
            {"username": "judge1", "email": "judge1@test.com", "role": "Judge"},
            {"username": "mentor1", "email": "mentor1@test.com", "role": "Mentor"}
        ]
        
        users = {}
        for ud in users_data:
            u = User.query.filter_by(username=ud['username']).first()
            if not u:
                u = User(username=ud['username'], email=ud['email'], password_hash=generate_password_hash('password123'), role=ud['role'])
                db.session.add(u)
                db.session.commit()
            users[ud['role']] = u
            
        # Create Event
        e = Event.query.filter_by(title="Global AI Hackathon 2026").first()
        if not e:
            e = Event(
                title="Global AI Hackathon 2026",
                description="Build the future of Artificial Intelligence. 48 hours to create something amazing.",
                start_date=datetime.utcnow(),
                end_date=datetime.utcnow() + timedelta(days=2),
                registration_deadline=datetime.utcnow() + timedelta(days=1),
                participant_limit=50,
                rules="1. Be respectful\n2. Code must be fresh\n3. Have fun!",
                is_published=True,
                organizer_id=users["Organizer"].id
            )
            db.session.add(e)
            db.session.commit()
            
        # Enroll Participant and Create Team
        enr = Enrollment.query.filter_by(event_id=e.id, user_id=users["Participant"].id).first()
        if not enr:
            enr = Enrollment(event_id=e.id, user_id=users["Participant"].id)
            db.session.add(enr)
            db.session.commit()
            
        t = Team.query.filter_by(name="Alpha AI").first()
        if not t:
            t = Team(name="Alpha AI", event_id=e.id, created_by=users["Participant"].id)
            db.session.add(t)
            db.session.commit()
            
            tm = TeamMember(team_id=t.id, user_id=users["Participant"].id)
            db.session.add(tm)
            db.session.commit()
            
        # Create Dummy Submission
        sub = Submission.query.filter_by(team_id=t.id).first()
        if not sub:
            sub = Submission(
                team_id=t.id,
                event_id=e.id,
                project_details="An AI model that predicts code bugs before they happen.",
                github_link="https://github.com/test/alpha-ai",
                demo_link="https://alpha-ai.demo.test",
                documentation_link="https://docs.alpha-ai.test"
            )
            db.session.add(sub)
            db.session.commit()
            
        print("Database seeded completely!")

if __name__ == "__main__":
    seed_db()
