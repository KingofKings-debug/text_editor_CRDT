"""Seed script: creates dummy accounts, an event with rounds, invites, and tests all flows."""
import requests
import json

BASE = "http://localhost:5000/api"

def register(username, email, password):
    r = requests.post(f"{BASE}/auth/register", json={"username": username, "email": email, "password": password})
    print(f"  Register {username}: {r.status_code} - {r.json().get('msg', '')}")
    return r

def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        data = r.json()
        print(f"  Login {email}: OK - user={data['user']['username']}")
        return data["access_token"], data["user"]
    else:
        print(f"  Login {email}: FAILED - {r.json()}")
        return None, None

def auth_header(token):
    return {"Authorization": f"Bearer {token}"}

print("=" * 60)
print("1. CREATING DUMMY ACCOUNTS")
print("=" * 60)
register("Alice", "alice@test.com", "pass1234")
register("Bob", "bob@test.com", "pass1234")
register("Charlie", "charlie@test.com", "pass1234")
register("Diana", "diana@test.com", "pass1234")
register("Eve", "eve@test.com", "pass1234")

# Test duplicate registration
print("\n--- Testing duplicate registration ---")
register("Alice", "alice2@test.com", "pass1234")  # should fail (username taken)
register("Alice2", "alice@test.com", "pass1234")  # should fail (email taken)

print("\n" + "=" * 60)
print("2. LOGIN ALL USERS")
print("=" * 60)
alice_token, alice_user = login("alice@test.com", "pass1234")
bob_token, bob_user = login("bob@test.com", "pass1234")
charlie_token, charlie_user = login("charlie@test.com", "pass1234")
diana_token, diana_user = login("diana@test.com", "pass1234")
eve_token, eve_user = login("eve@test.com", "pass1234")

print("\n" + "=" * 60)
print("3. ALICE CREATES A HACKATHON (becomes Organizer)")
print("=" * 60)
r = requests.post(f"{BASE}/events", json={
    "title": "AI Innovation Hackathon 2026",
    "description": "Build AI-powered solutions for real-world problems",
    "start_date": "2026-05-01T09:00:00",
    "end_date": "2026-05-03T18:00:00",
    "registration_deadline": "2026-04-30T23:59:00",
    "participant_limit": 100,
    "rules": "Teams of 2-4. Must use at least one AI/ML API."
}, headers=auth_header(alice_token))
event_data = r.json()
event_id = event_data.get("id")
print(f"  Create event: {r.status_code} - {event_data}")

# Check Alice's roles for this event
r = requests.get(f"{BASE}/events/{event_id}/my_roles", headers=auth_header(alice_token))
print(f"  Alice's roles for event: {r.json()}")

print("\n" + "=" * 60)
print("4. ADD ROUNDS (with date validation)")
print("=" * 60)

# Test: round BEFORE event should fail
r = requests.post(f"{BASE}/events/{event_id}/rounds", json={
    "name": "Bad Round", "start_time": "2026-04-01T09:00:00", "end_time": "2026-04-01T18:00:00",
    "submission_type": "Project"
}, headers=auth_header(alice_token))
print(f"  Round before event date: {r.status_code} - {r.json()['msg']}")

# Test: round AFTER event should fail
r = requests.post(f"{BASE}/events/{event_id}/rounds", json={
    "name": "Bad Round", "start_time": "2026-06-01T09:00:00", "end_time": "2026-06-01T18:00:00",
    "submission_type": "Project"
}, headers=auth_header(alice_token))
print(f"  Round after event date: {r.status_code} - {r.json()['msg']}")

# Add valid rounds
r1 = requests.post(f"{BASE}/events/{event_id}/rounds", json={
    "name": "Ideation & Planning",
    "description": "Form teams, brainstorm ideas, create a project plan",
    "start_time": "2026-05-01T09:00:00", "end_time": "2026-05-01T18:00:00",
    "submission_type": "Document"
}, headers=auth_header(alice_token))
print(f"  Round 1 (Ideation): {r1.status_code} - {r1.json()['msg']}")

r2 = requests.post(f"{BASE}/events/{event_id}/rounds", json={
    "name": "Build Sprint",
    "description": "Code your MVP - make it work!",
    "start_time": "2026-05-02T09:00:00", "end_time": "2026-05-02T23:00:00",
    "submission_type": "Code"
}, headers=auth_header(alice_token))
print(f"  Round 2 (Build): {r2.status_code} - {r2.json()['msg']}")

r3 = requests.post(f"{BASE}/events/{event_id}/rounds", json={
    "name": "Final Demo & Presentation",
    "description": "Present your project to judges. 10 min per team.",
    "start_time": "2026-05-03T10:00:00", "end_time": "2026-05-03T17:00:00",
    "submission_type": "Presentation"
}, headers=auth_header(alice_token))
print(f"  Round 3 (Demo): {r3.status_code} - {r3.json()['msg']}")

print("\n" + "=" * 60)
print("5. ALICE INVITES PEOPLE TO ROLES")
print("=" * 60)

# Invite Bob as Judge
r = requests.post(f"{BASE}/events/{event_id}/invite", json={"email": "bob@test.com", "role": "Judge"}, headers=auth_header(alice_token))
print(f"  Invite Bob as Judge: {r.status_code} - {r.json()['msg']}")

# Invite Charlie as Mentor
r = requests.post(f"{BASE}/events/{event_id}/invite", json={"email": "charlie@test.com", "role": "Mentor"}, headers=auth_header(alice_token))
print(f"  Invite Charlie as Mentor: {r.status_code} - {r.json()['msg']}")

# Try to invite non-existent user
r = requests.post(f"{BASE}/events/{event_id}/invite", json={"email": "nobody@test.com", "role": "Judge"}, headers=auth_header(alice_token))
print(f"  Invite non-existent: {r.status_code} - {r.json()['msg']}")

# Try duplicate invite
r = requests.post(f"{BASE}/events/{event_id}/invite", json={"email": "bob@test.com", "role": "Judge"}, headers=auth_header(alice_token))
print(f"  Duplicate invite: {r.status_code} - {r.json()['msg']}")

# Check Bob's roles
r = requests.get(f"{BASE}/events/{event_id}/my_roles", headers=auth_header(bob_token))
print(f"  Bob's roles: {r.json()}")

# Check Charlie's roles
r = requests.get(f"{BASE}/events/{event_id}/my_roles", headers=auth_header(charlie_token))
print(f"  Charlie's roles: {r.json()}")

print("\n" + "=" * 60)
print("6. PUBLISH THE EVENT")
print("=" * 60)
r = requests.post(f"{BASE}/events/{event_id}/publish", headers=auth_header(alice_token))
print(f"  Publish: {r.status_code} - {r.json()['msg']}")

# Test duplicate publish
r = requests.post(f"{BASE}/events/{event_id}/publish", headers=auth_header(alice_token))
print(f"  Double publish: {r.status_code} - {r.json()['msg']}")

print("\n" + "=" * 60)
print("7. PARTICIPANTS ENROLL (Diana & Eve)")
print("=" * 60)

# Diana enrolls
r = requests.post(f"{BASE}/events/{event_id}/enroll", headers=auth_header(diana_token))
print(f"  Diana enrolls: {r.status_code} - {r.json()['msg']}")

# Eve enrolls
r = requests.post(f"{BASE}/events/{event_id}/enroll", headers=auth_header(eve_token))
print(f"  Eve enrolls: {r.status_code} - {r.json()['msg']}")

# Alice (organizer) should NOT be able to enroll
r = requests.post(f"{BASE}/events/{event_id}/enroll", headers=auth_header(alice_token))
print(f"  Alice (organizer) tries to enroll: {r.status_code} - {r.json()['msg']}")

# Bob (judge) should NOT be able to enroll
r = requests.post(f"{BASE}/events/{event_id}/enroll", headers=auth_header(bob_token))
print(f"  Bob (judge) tries to enroll: {r.status_code} - {r.json()['msg']}")

print("\n" + "=" * 60)
print("8. TEAMS")
print("=" * 60)

# Diana creates a team
r = requests.post(f"{BASE}/events/{event_id}/teams", json={"name": "Neural Knights"}, headers=auth_header(diana_token))
print(f"  Diana creates team: {r.status_code} - {r.json()['msg']}")

# Eve creates another team
r = requests.post(f"{BASE}/events/{event_id}/teams", json={"name": "Byte Builders"}, headers=auth_header(eve_token))
print(f"  Eve creates team: {r.status_code} - {r.json()['msg']}")

# Diana tries to join another team (should fail - permanent)
r = requests.post(f"{BASE}/teams/2/join", headers=auth_header(diana_token))
print(f"  Diana tries to switch teams: {r.status_code} - {r.json()['msg']}")

# Check Diana's team
r = requests.get(f"{BASE}/events/{event_id}/my_team", headers=auth_header(diana_token))
print(f"  Diana's team: {r.json()}")

# List all teams 
r = requests.get(f"{BASE}/events/{event_id}/teams")
print(f"  All teams: {json.dumps(r.json(), indent=2)}")

print("\n" + "=" * 60)
print("9. SUBMISSIONS")
print("=" * 60)

# Diana submits for her team (team 1)
r = requests.post(f"{BASE}/teams/1/submit", json={
    "project_details": "AI Healthcare Assistant - uses GPT-4 to analyze symptoms and suggest preliminary diagnosis",
    "github_link": "https://github.com/neural-knights/ai-health",
    "demo_link": "https://ai-health-demo.vercel.app"
}, headers=auth_header(diana_token))
print(f"  Diana submits project: {r.status_code} - {r.json()['msg']}")

# Eve submits for her team (team 2)
r = requests.post(f"{BASE}/teams/2/submit", json={
    "project_details": "EcoTrack - ML-powered carbon footprint tracker using computer vision",
    "github_link": "https://github.com/byte-builders/ecotrack",
    "demo_link": "https://ecotrack.netlify.app",
    "documentation_link": "https://docs.ecotrack.dev"
}, headers=auth_header(eve_token))
print(f"  Eve submits project: {r.status_code} - {r.json()['msg']}")

print("\n" + "=" * 60)
print("10. JUDGE EVALUATES (Bob)")
print("=" * 60)

# Bob gets submissions
r = requests.get(f"{BASE}/events/{event_id}/submissions", headers=auth_header(bob_token))
subs = r.json()
print(f"  Bob sees {len(subs)} submissions")

# Bob evaluates submission 1
r = requests.post(f"{BASE}/submissions/1/evaluate", json={
    "score": 85, "feedback": "Excellent use of AI! Clean UI, well-documented. Minor: needs error handling for edge cases."
}, headers=auth_header(bob_token))
print(f"  Bob evaluates sub 1: {r.status_code} - {r.json()['msg']}")

# Bob evaluates submission 2
r = requests.post(f"{BASE}/submissions/2/evaluate", json={
    "score": 92, "feedback": "Outstanding project! Innovative approach to sustainability. Great demo, polished presentation."
}, headers=auth_header(bob_token))
print(f"  Bob evaluates sub 2: {r.status_code} - {r.json()['msg']}")

# Bob tries to evaluate again (should fail)
r = requests.post(f"{BASE}/submissions/1/evaluate", json={"score": 90, "feedback": "Changed my mind"}, headers=auth_header(bob_token))
print(f"  Bob re-evaluate: {r.status_code} - {r.json()['msg']}")

# Diana (not judge) tries to view submissions (should fail)
r = requests.get(f"{BASE}/events/{event_id}/submissions", headers=auth_header(diana_token))
print(f"  Diana tries eval page: {r.status_code} - {r.json().get('msg', 'No msg')}")

print("\n" + "=" * 60)
print("11. MENTOR SESSION (Charlie)")
print("=" * 60)

# Charlie creates a mentorship slot  
r = requests.post(f"{BASE}/events/{event_id}/mentorships", json={
    "time": "2026-05-02T14:00:00",
    "link": "https://zoom.us/j/1234567890"
}, headers=auth_header(charlie_token))
print(f"  Charlie creates slot: {r.status_code} - {r.json()['msg']}")

# Diana books the slot
r = requests.post(f"{BASE}/mentorships/1/book", headers=auth_header(diana_token))
print(f"  Diana books slot: {r.status_code} - {r.json()['msg']}")

# Eve tries to book same slot (should fail)
r = requests.post(f"{BASE}/mentorships/1/book", headers=auth_header(eve_token))
print(f"  Eve books same slot: {r.status_code} - {r.json()['msg']}")

print("\n" + "=" * 60)
print("12. ANNOUNCEMENTS (Alice as organizer)")
print("=" * 60)

r = requests.post(f"{BASE}/events/{event_id}/announcements", json={
    "content": "Welcome to AI Innovation Hackathon 2026! Check the schedule and start brainstorming. Good luck! 🚀"
}, headers=auth_header(alice_token))
print(f"  Alice posts announcement: {r.status_code} - {r.json()['msg']}")

r = requests.post(f"{BASE}/events/{event_id}/announcements", json={
    "content": "Reminder: Final submissions due by 5:00 PM on May 3rd. Make sure to include your demo link!"
}, headers=auth_header(alice_token))
print(f"  Alice posts second: {r.status_code} - {r.json()['msg']}")

# Diana (participant) tries to post (should fail)
r = requests.post(f"{BASE}/events/{event_id}/announcements", json={"content": "I'm a participant trying to post"}, headers=auth_header(diana_token))
print(f"  Diana tries to post: {r.status_code} - {r.json()['msg']}")

print("\n" + "=" * 60)
print("13. VIEW RESULTS")
print("=" * 60)
r = requests.get(f"{BASE}/events/{event_id}/results")
results = r.json()
for i, res in enumerate(results):
    print(f"  #{i+1} {res['team_name']}: {res['avg_score']}/100")

print("\n" + "=" * 60)
print("14. MY EVENTS")
print("=" * 60)
for name, token in [("Alice", alice_token), ("Bob", bob_token), ("Charlie", charlie_token), ("Diana", diana_token)]:
    r = requests.get(f"{BASE}/users/me/events", headers=auth_header(token))
    events = r.json()
    if events:
        for e in events:
            print(f"  {name}: '{e['title']}' - roles: {e['roles']}")
    else:
        print(f"  {name}: no events")

print("\n" + "=" * 60)
print("15. VIEW FINAL EVENT (with all data)")
print("=" * 60)
r = requests.get(f"{BASE}/events/{event_id}")
event = r.json()
print(f"  Title: {event['title']}")
print(f"  Organizer: {event['organizer_name']}")
print(f"  Published: {event['is_published']}")
print(f"  Rounds: {len(event['rounds'])}")
for rd in event['rounds']:
    print(f"    Round {rd['sequence_order']}: {rd['name']} ({rd['submission_type']})")

print("\n" + "=" * 60)
print("✅ ALL TESTS COMPLETE!")
print("=" * 60)
print("\nDummy accounts created:")
print("  alice@test.com / pass1234 (Event Creator/Organizer)")
print("  bob@test.com / pass1234 (Invited Judge)")
print("  charlie@test.com / pass1234 (Invited Mentor)")
print("  diana@test.com / pass1234 (Participant, team: Neural Knights)")
print("  eve@test.com / pass1234 (Participant, team: Byte Builders)")
