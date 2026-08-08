from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, verify_jwt_in_request
from models import db, User, Event, EventRole, Team, TeamMember, Announcement, Submission, Enrollment, Evaluation, MentorshipSession, Round
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import json

api_bp = Blueprint('api', __name__)

def get_current_user():
    return json.loads(get_jwt_identity())

def has_event_role(user_id, event_id, role):
    """Check if a user has a specific role for an event."""
    return EventRole.query.filter_by(event_id=event_id, user_id=user_id, role=role).first() is not None

def is_event_organizer(user_id, event_id):
    """Check if user is the creator or an invited organizer."""
    event = Event.query.get(event_id)
    if not event:
        return False
    if event.organizer_id == user_id:
        return True
    return has_event_role(user_id, event_id, 'Organizer')

def get_user_event_roles(user_id, event_id):
    """Get all roles a user has for a specific event."""
    event = Event.query.get(event_id)
    roles = []
    if event and event.organizer_id == user_id:
        roles.append('Organizer')
    event_roles = EventRole.query.filter_by(event_id=event_id, user_id=user_id).all()
    for er in event_roles:
        if er.role not in roles:
            roles.append(er.role)
    return roles

# ========== AUTH ==========
@api_bp.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"msg": "No data provided"}), 400
    
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not username:
        return jsonify({"msg": "Username is required"}), 400
    if not email:
        return jsonify({"msg": "Email is required"}), 400
    if not password:
        return jsonify({"msg": "Password is required"}), 400
    if len(password) < 4:
        return jsonify({"msg": "Password must be at least 4 characters"}), 400
    
    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Username is already taken"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email is already registered"}), 400
    
    try:
        hashed_pw = generate_password_hash(password)
        new_user = User(username=username, email=email, password_hash=hashed_pw)
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"msg": "User created successfully"}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"msg": f"Registration failed: {str(e)}"}), 500

@api_bp.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({"msg": "Bad email or password"}), 401
    
    identity_str = json.dumps({"id": user.id, "username": user.username})
    access_token = create_access_token(identity=identity_str)
    return jsonify(access_token=access_token, user={"id": user.id, "username": user.username, "email": user.email})

# ========== EVENTS ==========
@api_bp.route('/events', methods=['GET'])
def get_events():
    events = Event.query.all()
    result = []
    for e in events:
        round_count = Round.query.filter_by(event_id=e.id).count()
        organizer = User.query.get(e.organizer_id)
        result.append({
            "id": e.id, "title": e.title, "description": e.description,
            "start_date": e.start_date.isoformat(), "end_date": e.end_date.isoformat(),
            "rules": e.rules, "is_published": e.is_published, "organizer_id": e.organizer_id,
            "organizer_name": organizer.username if organizer else "Unknown",
            "round_count": round_count
        })
    return jsonify(result), 200

@api_bp.route('/events', methods=['POST'])
@jwt_required()
def create_event():
    current_user = get_current_user()
    data = request.get_json()
    
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    
    if not title or len(title) > 200:
        return jsonify({"msg": "Title is required and must be under 200 characters"}), 400
    if not description:
        return jsonify({"msg": "Description is required"}), 400
        
    try:
        start_date = datetime.fromisoformat(data['start_date'])
        end_date = datetime.fromisoformat(data['end_date'])
        reg_deadline_str = data.get('registration_deadline')
        registration_deadline = datetime.fromisoformat(reg_deadline_str) if reg_deadline_str else start_date
        participant_limit = int(data.get('participant_limit', 100))
    except (ValueError, KeyError, TypeError):
        return jsonify({"msg": "Invalid date or numerical format"}), 400
    
    now = datetime.utcnow()
    
    if start_date < now:
        return jsonify({"msg": "Event start date cannot be in the past"}), 400
    if registration_deadline > start_date:
        return jsonify({"msg": "Registration deadline must be before or equal to the start date"}), 400
    if end_date <= start_date:
        return jsonify({"msg": "End date must be after start date"}), 400
    if participant_limit < 1:
        return jsonify({"msg": "Participant limit must be at least 1"}), 400
    
    event = Event(
        title=title,
        description=description,
        start_date=start_date,
        end_date=end_date,
        registration_deadline=registration_deadline,
        participant_limit=participant_limit,
        rules=data.get('rules', '').strip(),
        is_published=False,
        organizer_id=current_user['id']
    )
    db.session.add(event)
    db.session.commit()
    
    # Creator automatically gets Organizer role
    role = EventRole(event_id=event.id, user_id=current_user['id'], role='Organizer')
    db.session.add(role)
    db.session.commit()
    
    return jsonify({"msg": "Event created as draft", "id": event.id}), 201

@api_bp.route('/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    e = Event.query.get(event_id)
    if not e: return jsonify({"msg": "Not found"}), 404
    rounds = Round.query.filter_by(event_id=e.id).order_by(Round.sequence_order).all()
    rounds_data = [{
        "id": r.id, "name": r.name, "description": r.description,
        "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat(),
        "submission_type": r.submission_type, "sequence_order": r.sequence_order,
        "results_declared": r.results_declared
    } for r in rounds]
    organizer = User.query.get(e.organizer_id)
    enrolled_count = Enrollment.query.filter_by(event_id=e.id).count()
    return jsonify({
        "id": e.id, "title": e.title, "description": e.description,
        "start_date": e.start_date.isoformat(), "end_date": e.end_date.isoformat(),
        "registration_deadline": e.registration_deadline.isoformat(),
        "participant_limit": e.participant_limit,
        "participant_count": enrolled_count,
        "rules": e.rules, "is_published": e.is_published, "organizer_id": e.organizer_id,
        "organizer_name": organizer.username if organizer else "Unknown",
        "rounds": rounds_data
    }), 200

# ========== PER-EVENT ROLES ==========
@api_bp.route('/events/<int:event_id>/my_roles', methods=['GET'])
@jwt_required()
def get_my_event_roles(event_id):
    current_user = get_current_user()
    roles = get_user_event_roles(current_user['id'], event_id)
    return jsonify({"roles": roles}), 200

@api_bp.route('/events/<int:event_id>/invite', methods=['POST'])
@jwt_required()
def invite_to_event(event_id):
    """Organizer invites a user by email to a specific role."""
    current_user = get_current_user()
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Only the event organizer can invite people"}), 403
    
    data = request.get_json()
    email = data.get('email', '').strip()
    role = data.get('role', '').strip()
    
    if not email:
        return jsonify({"msg": "Email is required"}), 400
    if role not in ['Judge', 'Mentor', 'Organizer']:
        return jsonify({"msg": "Role must be Judge, Mentor, or Organizer"}), 400
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"msg": f"No account found with email '{email}'. They must register first."}), 404
    
    if user.id == current_user['id']:
        return jsonify({"msg": "You are already the event creator"}), 400
    
    existing = EventRole.query.filter_by(event_id=event_id, user_id=user.id, role=role).first()
    if existing:
        return jsonify({"msg": f"{user.username} is already a {role} for this event"}), 400
    
    event_role = EventRole(event_id=event_id, user_id=user.id, role=role)
    db.session.add(event_role)
    
    existing_enrollment = Enrollment.query.filter_by(event_id=event_id, user_id=user.id).first()
    if existing_enrollment:
        return jsonify({"msg": f"{user.username} is already enrolled as a participant. They must unenroll before taking this role."}), 400
        
    db.session.commit()
    
    return jsonify({"msg": f"{user.username} has been invited as {role}", "username": user.username}), 201

@api_bp.route('/events/<int:event_id>/team_members', methods=['GET'])
@jwt_required()
def get_event_team_members(event_id):
    """Get all role holders for an event (organizer view)."""
    current_user = get_current_user()
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Unauthorized"}), 403
    
    event_roles = EventRole.query.filter_by(event_id=event_id).all()
    result = []
    for er in event_roles:
        user = User.query.get(er.user_id)
        if user:
            result.append({
                "id": er.id, "user_id": user.id, "username": user.username,
                "email": user.email, "role": er.role, "invited_at": er.invited_at.isoformat()
            })
    return jsonify(result), 200

@api_bp.route('/event_roles/<int:role_id>', methods=['DELETE'])
@jwt_required()
def remove_event_role(role_id):
    """Organizer removes someone's role."""
    current_user = get_current_user()
    er = EventRole.query.get(role_id)
    if not er: return jsonify({"msg": "Not found"}), 404
    if not is_event_organizer(current_user['id'], er.event_id):
        return jsonify({"msg": "Unauthorized"}), 403
    event = Event.query.get(er.event_id)
    if er.user_id == event.organizer_id and er.role == 'Organizer':
        return jsonify({"msg": "Cannot remove the event creator's organizer role"}), 400
    
    db.session.delete(er)
    db.session.commit()
    return jsonify({"msg": "Role removed"}), 200

@api_bp.route('/users/me/events', methods=['GET'])
@jwt_required()
def get_my_events():
    """Get events where the current user has a role."""
    current_user = get_current_user()
    # Events created by user
    created = Event.query.filter_by(organizer_id=current_user['id']).all()
    # Events where user has a role
    role_entries = EventRole.query.filter_by(user_id=current_user['id']).all()
    event_ids = set([e.id for e in created] + [er.event_id for er in role_entries])
    
    result = []
    for eid in event_ids:
        e = Event.query.get(eid)
        if e:
            roles = get_user_event_roles(current_user['id'], eid)
            result.append({
                "id": e.id, "title": e.title, "is_published": e.is_published,
                "start_date": e.start_date.isoformat(), "roles": roles
            })
    return jsonify(result), 200

# ========== ENROLLMENT ==========
@api_bp.route('/events/<int:event_id>/enroll', methods=['POST'])
@jwt_required()
def enroll_event(event_id):
    current_user = get_current_user()
    event = Event.query.get(event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if not event.is_published:
        return jsonify({"msg": "Cannot enroll in an unpublished event"}), 400
    if datetime.utcnow() > event.end_date:
        return jsonify({"msg": "This event has already ended"}), 400
    
    if datetime.utcnow() > event.registration_deadline:
        return jsonify({"msg": "The registration deadline for this event has passed"}), 400
    
    # Organizers/judges/mentors of this event should not enroll as participants
    roles = get_user_event_roles(current_user['id'], event_id)
    if roles:
        return jsonify({"msg": "You have an assigned role for this event and cannot enroll as a participant"}), 400
    
    # Enforce strict capacity checking before enrollment (simple race condition protection context-wise)
    current_count = Enrollment.query.filter_by(event_id=event_id).count()
    if current_count >= event.participant_limit:
        return jsonify({"msg": "Event capacity has been reached. No more registrations allowed."}), 400
        
    existing = Enrollment.query.filter_by(event_id=event_id, user_id=current_user['id']).first()
    if existing: return jsonify({"msg": "Already enrolled"}), 400
    
    enrollment = Enrollment(event_id=event_id, user_id=current_user['id'])
    db.session.add(enrollment)
    db.session.commit()
    return jsonify({"msg": "Enrolled successfully"}), 201

@api_bp.route('/events/<int:event_id>/enroll', methods=['DELETE'])
@jwt_required()
def unenroll_event(event_id):
    current_user = get_current_user()
    enr = Enrollment.query.filter_by(event_id=event_id, user_id=current_user['id']).first()
    if not enr:
        return jsonify({"msg": "Not enrolled in this event"}), 400
    db.session.delete(enr)
    
    # Also remove from any team in this event safely
    teams = Team.query.filter_by(event_id=event_id).all()
    for t in teams:
        tm = TeamMember.query.filter_by(team_id=t.id, user_id=current_user['id']).first()
        if tm:
            db.session.delete(tm)
            
    db.session.commit()
    return jsonify({"msg": "Unenrolled successfully"}), 200

@api_bp.route('/events/<int:event_id>/participants', methods=['GET'])
@jwt_required()
def get_event_participants(event_id):
    current_user = get_current_user()
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Unauthorized"}), 403
    
    enrollments = Enrollment.query.filter_by(event_id=event_id).all()
    users = []
    for enr in enrollments:
        user = User.query.get(enr.user_id)
        if user: users.append({"id": user.id, "username": user.username, "email": user.email, "enrolled_at": enr.enrolled_at.isoformat()})
    return jsonify(users), 200

@api_bp.route('/events/<int:event_id>/enrollment_status', methods=['GET'])
@jwt_required()
def check_enrollment(event_id):
    current_user = get_current_user()
    enr = Enrollment.query.filter_by(event_id=event_id, user_id=current_user['id']).first()
    return jsonify({"enrolled": enr is not None}), 200

# ========== ANNOUNCEMENTS ==========
@api_bp.route('/events/<int:event_id>/announcements', methods=['POST'])
@jwt_required()
def post_announcement(event_id):
    current_user = get_current_user()
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Only organizers can post announcements"}), 403
    
    data = request.get_json()
    announcement = Announcement(event_id=event_id, content=data['content'])
    db.session.add(announcement)
    db.session.commit()
    return jsonify({"msg": "Announcement created"}), 201

@api_bp.route('/events/<int:event_id>/announcements', methods=['GET'])
def get_announcements(event_id):
    announcements = Announcement.query.filter_by(event_id=event_id).order_by(Announcement.created_at.desc()).all()
    return jsonify([{"id": a.id, "content": a.content, "created_at": a.created_at.isoformat()} for a in announcements]), 200

# ========== TEAMS ==========
@api_bp.route('/events/<int:event_id>/teams', methods=['POST'])
@jwt_required()
def create_team(event_id):
    current_user = get_current_user()
    event = Event.query.get(event_id)
    if not event:
        return jsonify({"msg": "Event not found"}), 404
    if not event.is_published:
        return jsonify({"msg": "Cannot create a team for an unpublished event"}), 400
    if datetime.utcnow() > event.end_date:
        return jsonify({"msg": "This event has already ended"}), 400
        
    enr = Enrollment.query.filter_by(event_id=event_id, user_id=current_user['id']).first()
    if not enr:
        return jsonify({"msg": "You must enroll in the event before creating a team"}), 400
    
    existing_teams = Team.query.filter_by(event_id=event_id).all()
    for t in existing_teams:
        if TeamMember.query.filter_by(team_id=t.id, user_id=current_user['id']).first():
            return jsonify({"msg": "You are already in a team for this event. Team selection is permanent."}), 400
    
    data = request.get_json()
    team = Team(name=data['name'], event_id=event_id, created_by=current_user['id'])
    db.session.add(team)
    db.session.commit()
    
    member = TeamMember(team_id=team.id, user_id=current_user['id'])
    db.session.add(member)
    db.session.commit()
    return jsonify({"msg": "Team created", "id": team.id}), 201

@api_bp.route('/teams/<int:team_id>/join', methods=['POST'])
@jwt_required()
def join_team(team_id):
    current_user = get_current_user()
    
    existing = TeamMember.query.filter_by(team_id=team_id, user_id=current_user['id']).first()
    if existing:
        return jsonify({"msg": "Already a member of this team"}), 400
    
    team = Team.query.get(team_id)
    if not team:
        return jsonify({"msg": "Team not found"}), 404
        
    event = Event.query.get(team.event_id)
    if not event.is_published:
        return jsonify({"msg": "Cannot join a team in an unpublished event"}), 400
    if datetime.utcnow() > event.end_date:
        return jsonify({"msg": "This event has already ended"}), 400
        
    enr = Enrollment.query.filter_by(event_id=team.event_id, user_id=current_user['id']).first()
    if not enr:
        return jsonify({"msg": "You must enroll in the event before joining a team"}), 400
    
    event_teams = Team.query.filter_by(event_id=team.event_id).all()
    for t in event_teams:
        if TeamMember.query.filter_by(team_id=t.id, user_id=current_user['id']).first():
            return jsonify({"msg": "You are already in a team for this event. Team selection is permanent."}), 400
    
    member = TeamMember(team_id=team_id, user_id=current_user['id'])
    db.session.add(member)
    db.session.commit()
    return jsonify({"msg": "Joined team successfully"}), 201

@api_bp.route('/events/<int:event_id>/my_team', methods=['GET'])
@jwt_required()
def get_my_team(event_id):
    current_user = get_current_user()
    event_teams = Team.query.filter_by(event_id=event_id).all()
    for t in event_teams:
        if TeamMember.query.filter_by(team_id=t.id, user_id=current_user['id']).first():
            members = TeamMember.query.filter_by(team_id=t.id).all()
            member_list = []
            for m in members:
                u = User.query.get(m.user_id)
                if u: member_list.append({"id": u.id, "username": u.username})
            return jsonify({"team_id": t.id, "team_name": t.name, "members": member_list}), 200
    return jsonify({"team_id": None}), 200

@api_bp.route('/events/<int:event_id>/teams', methods=['GET'])
def get_teams(event_id):
    teams = Team.query.filter_by(event_id=event_id).all()
    result = []
    for t in teams:
        members = TeamMember.query.filter_by(team_id=t.id).all()
        member_names = [User.query.get(m.user_id).username for m in members if User.query.get(m.user_id)]
        result.append({"id": t.id, "name": t.name, "member_count": len(members), "members": member_names})
    return jsonify(result), 200

# ========== SUBMISSIONS ==========
@api_bp.route('/teams/<int:team_id>/rounds/<int:round_id>/submit', methods=['POST'])
@jwt_required()
def submit_project(team_id, round_id):
    current_user = get_current_user()
    member = TeamMember.query.filter_by(team_id=team_id, user_id=current_user['id']).first()
    if not member:
        return jsonify({"msg": "Not a team member"}), 403
    
    team = Team.query.get(team_id)
    event = Event.query.get(team.event_id)
    
    round_obj = Round.query.get(round_id)
    if not round_obj or round_obj.event_id != team.event_id:
        return jsonify({"msg": "Invalid round"}), 400
        
    now = datetime.now()
    if now < round_obj.start_time:
        return jsonify({"msg": "Round has not started yet"}), 400
    if now > round_obj.end_time:
        return jsonify({"msg": "Round has already ended, submissions are closed for this round"}), 400
        
    if round_obj.sequence_order > 1:
        prev_round = Round.query.filter_by(event_id=event.id, sequence_order=round_obj.sequence_order - 1).first()
        if prev_round:
            prev_sub = Submission.query.filter_by(team_id=team_id, round_id=prev_round.id).first()
            if not prev_sub or not prev_sub.is_promoted:
                return jsonify({"msg": "Your team has not advanced to this round yet"}), 403
        
    data = request.get_json()
    
    submission = Submission.query.filter_by(team_id=team_id, event_id=team.event_id, round_id=round_id).first()
    if submission:
        return jsonify({"msg": "Your team has already submitted a project for this round."}), 400
        
    submission = Submission(
        team_id=team_id, event_id=team.event_id, round_id=round_id,
        project_details=data['project_details'],
        github_link=data.get('github_link', ''),
        demo_link=data.get('demo_link', ''),
        documentation_link=data.get('documentation_link', '')
    )
    db.session.add(submission)
    db.session.commit()
    return jsonify({"msg": "Project submitted successfully"}), 201

@api_bp.route('/events/<int:event_id>/submissions', methods=['GET'])
@jwt_required()
def get_submissions(event_id):
    current_user = get_current_user()
    if not (has_event_role(current_user['id'], event_id, 'Judge') or has_event_role(current_user['id'], event_id, 'Mentor') or is_event_organizer(current_user['id'], event_id)):
        return jsonify({"msg": "Unauthorized"}), 403
    
    subs = Submission.query.filter_by(event_id=event_id).all()
    res = []
    for s in subs:
        t = Team.query.get(s.team_id)
        evals = Evaluation.query.filter_by(submission_id=s.id, judge_id=current_user['id']).first()
        members = []
        if t:
            team_members = TeamMember.query.filter_by(team_id=t.id).all()
            for tm in team_members:
                u = User.query.get(tm.user_id)
                if u: members.append(u.username)
        
        res.append({
            "id": s.id, "team_name": t.name if t else "Unknown",
            "members": members,
            "project_details": s.project_details, "github_link": s.github_link,
            "demo_link": s.demo_link, "documentation_link": s.documentation_link,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            "has_evaluated": evals is not None,
            "round_id": s.round_id
        })
    return jsonify(res), 200

@api_bp.route('/submissions/<int:sub_id>/evaluate', methods=['POST'])
@jwt_required()
def evaluate_submission(sub_id):
    current_user = get_current_user()
    sub = Submission.query.get(sub_id)
    if not sub: return jsonify({"msg": "Submission not found"}), 404
    
    if not has_event_role(current_user['id'], sub.event_id, 'Judge'):
        return jsonify({"msg": "Only judges for this event can evaluate"}), 403
    
    existing = Evaluation.query.filter_by(submission_id=sub_id, judge_id=current_user['id']).first()
    if existing:
        return jsonify({"msg": "You have already evaluated this submission"}), 400
    
    data = request.get_json()
    e = Evaluation(submission_id=sub_id, judge_id=current_user['id'], score=data['score'], feedback=data['feedback'])
    db.session.add(e)
    db.session.commit()
    return jsonify({"msg": "Evaluation saved"}), 201

@api_bp.route('/submissions/<int:sub_id>/promote', methods=['POST'])
@jwt_required()
def promote_submission(sub_id):
    current_user = get_current_user()
    sub = Submission.query.get(sub_id)
    if not sub: return jsonify({"msg": "Submission not found"}), 404
    if not is_event_organizer(current_user['id'], sub.event_id):
        return jsonify({"msg": "Unauthorized"}), 403
    
    sub.is_promoted = not sub.is_promoted
    db.session.commit()
    msg = "Team promoted to next round" if sub.is_promoted else "Team promotion removed"
    return jsonify({"msg": msg, "is_promoted": sub.is_promoted}), 200

@api_bp.route('/events/<int:event_id>/results', methods=['GET'])
@jwt_required(optional=True)
def get_results(event_id):
    identity = get_jwt_identity()
    user_data = json.loads(identity) if identity else None
    
    is_org = user_data and is_event_organizer(user_data['id'], event_id)
    
    if is_org:
        rounds = Round.query.filter_by(event_id=event_id).order_by(Round.sequence_order).all()
    else:
        rounds = Round.query.filter_by(event_id=event_id, results_declared=True).order_by(Round.sequence_order).all()
        
    results_by_round = []
    
    for r in rounds:
        subs = Submission.query.filter_by(round_id=r.id).all()
        round_results = []
        for s in subs:
            t = Team.query.get(s.team_id)
            evals = Evaluation.query.filter_by(submission_id=s.id).all()
            if not evals: continue
            avg_score = sum(e.score for e in evals) / len(evals)
            feedbacks = [{"feedback": e.feedback, "score": e.score} for e in evals]
            round_results.append({
                "submission_id": s.id,
                "team_name": t.name if t else "Unknown", 
                "avg_score": round(avg_score, 2), 
                "feedbacks": feedbacks,
                "is_promoted": s.is_promoted
            })
        
        round_results.sort(key=lambda x: x['avg_score'], reverse=True)
        results_by_round.append({
            "round_id": r.id,
            "round_name": r.name,
            "sequence_order": r.sequence_order,
            "results_declared": r.results_declared,
            "results": round_results
        })
        
    return jsonify(results_by_round), 200

@api_bp.route('/teams/<int:team_id>/available_rounds', methods=['GET'])
@jwt_required()
def get_available_rounds(team_id):
    current_user = get_current_user()
    team = Team.query.get(team_id)
    if not team: return jsonify({"msg": "Team not found"}), 404
    
    rounds = Round.query.filter_by(event_id=team.event_id).order_by(Round.sequence_order).all()
    available = []
    now = datetime.now()
    
    for r in rounds:
        if now < r.start_time or now > r.end_time:
            continue
            
        sub = Submission.query.filter_by(team_id=team_id, round_id=r.id).first()
        if sub:
            continue
            
        if r.sequence_order == 1:
            available.append(r)
        else:
            prev_round = Round.query.filter_by(event_id=team.event_id, sequence_order=r.sequence_order - 1).first()
            if prev_round:
                prev_sub = Submission.query.filter_by(team_id=team_id, round_id=prev_round.id).first()
                if prev_sub and prev_sub.is_promoted:
                    available.append(r)
                else:
                    break
                    
    res = []
    for r in available:
        res.append({
            "id": r.id, "name": r.name, "description": r.description,
            "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat(),
            "submission_type": r.submission_type, "sequence_order": r.sequence_order
        })
    return jsonify(res), 200

@api_bp.route('/teams/<int:team_id>/submissions', methods=['GET'])
@jwt_required()
def get_team_submissions(team_id):
    current_user = get_current_user()
    team = Team.query.get(team_id)
    if not team: return jsonify({"msg": "Team not found"}), 404
    
    is_member = TeamMember.query.filter_by(team_id=team_id, user_id=current_user['id']).first()
    if not is_member and not is_event_organizer(current_user['id'], team.event_id):
        return jsonify({"msg": "Unauthorized"}), 403
        
    submissions = Submission.query.filter_by(team_id=team_id).all()
    res = []
    for s in submissions:
        r = Round.query.get(s.round_id)
        res.append({
            "id": s.id, "round_name": r.name, "sequence_order": r.sequence_order,
            "project_details": s.project_details, "github_link": s.github_link,
            "demo_link": s.demo_link, "documentation_link": s.documentation_link, 
            "is_promoted": s.is_promoted,
            "submitted_at": s.submitted_at.isoformat()
        })
    res.sort(key=lambda x: x['sequence_order'])
    return jsonify(res), 200

# ========== MENTORSHIPS ==========
@api_bp.route('/events/<int:event_id>/mentorships', methods=['GET'])
def get_mentorships(event_id):
    sessions = MentorshipSession.query.filter_by(event_id=event_id).all()
    res = []
    for s in sessions:
        user = User.query.get(s.mentor_id)
        team = Team.query.get(s.team_id) if s.team_id else None
        res.append({
            "id": s.id, "mentor_name": user.username if user else "Unknown Mentor",
            "team_name": team.name if team else None,
            "scheduled_time": s.scheduled_time.isoformat(), "link": s.link
        })
    return jsonify(res), 200

@api_bp.route('/events/<int:event_id>/mentorships', methods=['POST'])
@jwt_required()
def create_mentorship(event_id):
    current_user = get_current_user()
    if not has_event_role(current_user['id'], event_id, 'Mentor'):
        return jsonify({"msg": "Only invited Mentors for this event can create slots"}), 403
        
    event = Event.query.get(event_id)
    data = request.get_json()
    scheduled_time = datetime.fromisoformat(data['time'])
    
    if scheduled_time <= datetime.utcnow():
        return jsonify({"msg": "Mentorship slot time must be in the future"}), 400
    if scheduled_time < event.start_date or scheduled_time > event.end_date:
        return jsonify({"msg": "Mentorship slot must be within the event dates"}), 400
        
    ms = MentorshipSession(event_id=event_id, mentor_id=current_user['id'], scheduled_time=scheduled_time, link=data.get('link'))
    db.session.add(ms)
    db.session.commit()
    return jsonify({"msg": "Slot created"}), 201

@api_bp.route('/mentorships/<int:slot_id>/book', methods=['POST'])
@jwt_required()
def book_mentorship(slot_id):
    current_user = get_current_user()
    ms = MentorshipSession.query.get(slot_id)
    if not ms: return jsonify({"msg": "Not found"}), 404
    if ms.team_id: return jsonify({"msg": "Slot already booked"}), 400
    if ms.scheduled_time <= datetime.utcnow():
        return jsonify({"msg": "Cannot book a mentorship slot that has already passed"}), 400
    
    member = TeamMember.query.filter_by(user_id=current_user['id']).first()
    if not member: return jsonify({"msg": "Must be in a team to book"}), 400
    ms.team_id = member.team_id
    db.session.commit()
    return jsonify({"msg": "Slot booked"}), 200

# ========== ROUNDS ==========
@api_bp.route('/events/<int:event_id>/rounds', methods=['GET'])
def get_rounds(event_id):
    rounds = Round.query.filter_by(event_id=event_id).order_by(Round.sequence_order).all()
    return jsonify([{
        "id": r.id, "name": r.name, "description": r.description,
        "start_time": r.start_time.isoformat(), "end_time": r.end_time.isoformat(),
        "submission_type": r.submission_type, "sequence_order": r.sequence_order,
        "results_declared": r.results_declared
    } for r in rounds]), 200

@api_bp.route('/rounds/<int:round_id>/declare_results', methods=['POST'])
@jwt_required()
def declare_round_results(round_id):
    current_user = get_current_user()
    r = Round.query.get(round_id)
    if not r: return jsonify({"msg": "Round not found"}), 404
    if not is_event_organizer(current_user['id'], r.event_id):
        return jsonify({"msg": "Unauthorized"}), 403
    r.results_declared = not r.results_declared
    db.session.commit()
    msg = "Results declared" if r.results_declared else "Results hidden"
    return jsonify({"msg": msg, "results_declared": r.results_declared}), 200

@api_bp.route('/events/<int:event_id>/rounds', methods=['POST'])
@jwt_required()
def add_round(event_id):
    current_user = get_current_user()
    event = Event.query.get(event_id)
    if not event: return jsonify({"msg": "Event not found"}), 404
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Only the event organizer can add rounds"}), 403
    
    data = request.get_json()
    start_time = datetime.fromisoformat(data['start_time'])
    end_time = datetime.fromisoformat(data['end_time'])
    
    # Date validations
    if end_time <= start_time:
        return jsonify({"msg": "Round end time must be after start time"}), 400
    if start_time < event.start_date:
        return jsonify({"msg": f"Round cannot start before the event starts ({event.start_date.strftime('%Y-%m-%d %H:%M')})"}), 400
    if end_time > event.end_date:
        return jsonify({"msg": f"Round cannot end after the event ends ({event.end_date.strftime('%Y-%m-%d %H:%M')})"}), 400
        
    last_round = Round.query.filter_by(event_id=event_id).order_by(Round.sequence_order.desc()).first()
    if last_round and start_time < last_round.end_time:
        return jsonify({"msg": f"Round start time must be after the previous round ends ({last_round.end_time.strftime('%Y-%m-%d %H:%M')})"}), 400
    
    existing_count = Round.query.filter_by(event_id=event_id).count()
    
    r = Round(
        event_id=event_id, name=data['name'], description=data.get('description', ''),
        start_time=start_time, end_time=end_time,
        submission_type=data.get('submission_type', 'Project'),
        sequence_order=existing_count + 1
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({"msg": "Round added", "id": r.id, "sequence_order": r.sequence_order}), 201

@api_bp.route('/rounds/<int:round_id>', methods=['DELETE'])
@jwt_required()
def delete_round(round_id):
    current_user = get_current_user()
    r = Round.query.get(round_id)
    if not r: return jsonify({"msg": "Round not found"}), 404
    event = Event.query.get(r.event_id)
    if not is_event_organizer(current_user['id'], r.event_id):
        return jsonify({"msg": "Only the event organizer can delete rounds"}), 403
    if event.is_published:
        return jsonify({"msg": "Cannot modify rounds after publishing"}), 400
    
    ev_id = r.event_id
    db.session.delete(r)
    remaining = Round.query.filter_by(event_id=ev_id).order_by(Round.sequence_order).all()
    for i, rnd in enumerate(remaining):
        rnd.sequence_order = i + 1
    db.session.commit()
    return jsonify({"msg": "Round deleted"}), 200

@api_bp.route('/events/<int:event_id>/publish', methods=['POST'])
@jwt_required()
def publish_event(event_id):
    current_user = get_current_user()
    event = Event.query.get(event_id)
    if not event: return jsonify({"msg": "Event not found"}), 404
    if not is_event_organizer(current_user['id'], event_id):
        return jsonify({"msg": "Only the event organizer can publish"}), 403
    if event.is_published:
        return jsonify({"msg": "Event is already published"}), 400
    
    round_count = Round.query.filter_by(event_id=event_id).count()
    if round_count == 0:
        return jsonify({"msg": "Add at least one round before publishing"}), 400
    
    event.is_published = True
    db.session.commit()
    return jsonify({"msg": "Event published successfully"}), 200
