import os
from datetime import datetime, timedelta
from app import app, db
from models import User, Event, EventRole, Round, Enrollment, Team, TeamMember, Submission, Evaluation
from werkzeug.security import generate_password_hash

def seed_database():
    with app.app_context():
        print("Dropping existing tables...")
        db.drop_all()
        print("Creating fresh tables...")
        db.create_all()

        print("Creating dummy users...")
        users = [
            User(username="alice_org", email="alice@org.com", password_hash=generate_password_hash("password")),
            User(username="bob_mentor", email="bob@mentor.com", password_hash=generate_password_hash("password")),
            User(username="charlie_judge", email="charlie@judge.com", password_hash=generate_password_hash("password")),
            User(username="dave_dev", email="dave@team.com", password_hash=generate_password_hash("password")),
            User(username="eve_design", email="eve@team.com", password_hash=generate_password_hash("password")),
            User(username="frank_solo", email="frank@solo.com", password_hash=generate_password_hash("password"))
        ]
        db.session.add_all(users)
        db.session.commit()

        # Users reference
        u_alice = User.query.filter_by(username="alice_org").first()
        u_bob = User.query.filter_by(username="bob_mentor").first()
        u_charlie = User.query.filter_by(username="charlie_judge").first()
        u_dave = User.query.filter_by(username="dave_dev").first()
        u_eve = User.query.filter_by(username="eve_design").first()
        u_frank = User.query.filter_by(username="frank_solo").first()

        print("Creating dummy event & event roles...")
        now = datetime.utcnow()
        event = Event(
            title="Global AI Challenge 2026",
            description="Build Next-Gen Models! Connect with industry mentors globally.",
            start_date=now - timedelta(days=2),
            end_date=now + timedelta(days=10),
            registration_deadline=now - timedelta(days=2),
            participant_limit=50,
            rules="1. Be creative\n2. Open source stack required",
            is_published=True,
            organizer_id=u_alice.id
        )
        db.session.add(event)
        db.session.commit()

        # Active Event Roles
        roles = [
            EventRole(event_id=event.id, user_id=u_alice.id, role='Organizer'),
            EventRole(event_id=event.id, user_id=u_bob.id, role='Mentor'),
            EventRole(event_id=event.id, user_id=u_charlie.id, role='Judge')
        ]
        db.session.add_all(roles)
        db.session.commit()

        print("Creating event rounds...")
        rounds = [
            Round(
                event_id=event.id, name="Ideation Phase", description="Submit your project pitches",
                start_time=now - timedelta(days=2), end_time=now + timedelta(days=2),
                submission_type="Pitch Deck", sequence_order=1, results_declared=False
            ),
            Round(
                event_id=event.id, name="Final Prototype", description="Functional code and demo",
                start_time=now + timedelta(days=3), end_time=now + timedelta(days=9),
                submission_type="Code Repository", sequence_order=2, results_declared=False
            )
        ]
        db.session.add_all(rounds)
        db.session.commit()
        
        round_1 = Round.query.filter_by(event_id=event.id, sequence_order=1).first()

        print("Creating enrollments & teams...")
        enrollments = [
            Enrollment(event_id=event.id, user_id=u_dave.id),
            Enrollment(event_id=event.id, user_id=u_eve.id),
            Enrollment(event_id=event.id, user_id=u_frank.id)
        ]
        db.session.add_all(enrollments)
        db.session.commit()

        team_1 = Team(name="Neural Ninjas", event_id=event.id, created_by=u_dave.id)
        team_2 = Team(name="Solo Voyager", event_id=event.id, created_by=u_frank.id)
        db.session.add_all([team_1, team_2])
        db.session.commit()

        members = [
            TeamMember(team_id=team_1.id, user_id=u_dave.id),
            TeamMember(team_id=team_1.id, user_id=u_eve.id),
            TeamMember(team_id=team_2.id, user_id=u_frank.id)
        ]
        db.session.add_all(members)
        db.session.commit()

        print("Adding submissions & evaluations for Round 1...")
        sub_1 = Submission(
            team_id=team_1.id, event_id=event.id, round_id=round_1.id,
            project_details="Revolutionary LLM agent orchestration platform connecting local devices.",
            github_link="https://github.com/neuralninjas/agent",
            is_promoted=False
        )
        sub_2 = Submission(
            team_id=team_2.id, event_id=event.id, round_id=round_1.id,
            project_details="A simple data classification script using regression.",
            is_promoted=False
        )
        db.session.add_all([sub_1, sub_2])
        db.session.commit()

        eval_1 = Evaluation(submission_id=sub_1.id, judge_id=u_charlie.id, score=92, feedback="Incredible idea and thorough pitch deck. Can't wait to see the code!")
        eval_2 = Evaluation(submission_id=sub_2.id, judge_id=u_charlie.id, score=45, feedback="A bit too simple for this hackathon format. Needs more innovation.")
        db.session.add_all([eval_1, eval_2])
        db.session.commit()

        print("Database seeding completed securely!")
        print("----- ACCOUNTS FOR TESTING -----")
        print("alice@org.com (Organizer)")
        print("bob@mentor.com (Mentor)")
        print("charlie@judge.com (Judge)")
        print("dave@team.com (Participant - Neural Ninjas)")
        print("frank@solo.com (Participant - Solo Voyager)")
        print("All passwords are: password")

if __name__ == "__main__":
    seed_database()
