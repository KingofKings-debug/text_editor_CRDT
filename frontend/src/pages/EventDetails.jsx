import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

function EventDetails() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [teams, setTeams] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [results, setResults] = useState([]);
  const [mentorships, setMentorships] = useState([]);
  const [myRoles, setMyRoles] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]); // event role holders
  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [newSlotTime, setNewSlotTime] = useState('');
  const [newSlotLink, setNewSlotLink] = useState('');
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Judge');
  const { user, token } = useContext(AuthContext);

  const hasRole = (role) => myRoles.includes(role);
  const isOrganizer = hasRole('Organizer');
  const isJudge = hasRole('Judge');
  const isMentor = hasRole('Mentor');
  const isParticipant = !isOrganizer && !isJudge && !isMentor;

  const fetchEventData = async () => {
    try {
      const evRes = await axios.get(`http://localhost:5000/api/events/${id}`);
      setEvent(evRes.data);
      const annRes = await axios.get(`http://localhost:5000/api/events/${id}/announcements`);
      setAnnouncements(annRes.data);
      const teamsRes = await axios.get(`http://localhost:5000/api/events/${id}/teams`);
      setTeams(teamsRes.data);
      const resRes = await axios.get(`http://localhost:5000/api/events/${id}/results`, {
        // Pass token to check for Organizer privileges
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      setResults(resRes.data);
      const mRes = await axios.get(`http://localhost:5000/api/events/${id}/mentorships`);
      setMentorships(mRes.data);

      if (user && token) {
        // Fetch per-event roles
        const rolesRes = await axios.get(`http://localhost:5000/api/events/${id}/my_roles`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMyRoles(rolesRes.data.roles);
        
        const enrRes = await axios.get(`http://localhost:5000/api/events/${id}/enrollment_status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setIsEnrolled(enrRes.data.enrolled);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrganizerData = async () => {
    if (!token) return;
    try {
      const partRes = await axios.get(`http://localhost:5000/api/events/${id}/participants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setParticipants(partRes.data);
      
      const tmRes = await axios.get(`http://localhost:5000/api/events/${id}/team_members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTeamMembers(tmRes.data);
    } catch (err) {
      // Not organizer, that's fine
    }
  };

  useEffect(() => {
    fetchEventData();
  }, [id, user, token]);

  useEffect(() => {
    if (isOrganizer) fetchOrganizerData();
  }, [isOrganizer, token, id]);

  const handleEnroll = async () => {
    try {
      await axios.post(`http://localhost:5000/api/events/${id}/enroll`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsEnrolled(true);
    } catch (err) { alert(err.response?.data?.msg || 'Could not enroll'); }
  };

  const handleUnenroll = async () => {
    if (!confirm('Are you sure you want to unenroll? This will remove you from any associated teams.')) return;
    try {
      await axios.delete(`http://localhost:5000/api/events/${id}/enroll`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setIsEnrolled(false);
      fetchEventData(); // Refresh to update counts and team arrays
    } catch (err) { alert(err.response?.data?.msg || 'Could not unenroll'); }
  };

  const handlePostAnnouncement = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`http://localhost:5000/api/events/${id}/announcements`, { content: newAnnouncement }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewAnnouncement('');
      fetchEventData();
    } catch (err) { alert(err.response?.data?.msg || 'Error'); }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`http://localhost:5000/api/events/${id}/invite`, { email: inviteEmail, role: inviteRole }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(res.data.msg);
      setInviteEmail('');
      fetchOrganizerData();
    } catch (err) { alert(err.response?.data?.msg || 'Error inviting'); }
  };

  const handleRemoveRole = async (roleId) => {
    if (!confirm('Remove this person from this role?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/event_roles/${roleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchOrganizerData();
    } catch (err) { alert(err.response?.data?.msg || 'Error'); }
  };

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`http://localhost:5000/api/events/${id}/mentorships`, { time: newSlotTime, link: newSlotLink }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewSlotTime('');
      setNewSlotLink('');
      fetchEventData();
    } catch (err) { alert(err.response?.data?.msg || 'Error'); }
  };

  const handleBookSlot = async (slotId) => {
    try {
      await axios.post(`http://localhost:5000/api/mentorships/${slotId}/book`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchEventData();
    } catch (err) { alert(err.response?.data?.msg || 'Could not book'); }
  };

  if (!event) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading event...</div>;

  const getPhaseStatus = () => {
    const now = new Date();
    const start = new Date(event.start_date);
    const end = new Date(event.end_date);
    if (now < start) return "Upcoming";
    if (now > end) return "Ended";
    
    // Find active round
    if (event.rounds && event.rounds.length > 0) {
      for (const r of event.rounds) {
        if (now >= new Date(r.start_time) && now <= new Date(r.end_time)) {
          return `Active: Round ${r.sequence_order} - ${r.name}`;
        }
      }
    }
    return "Active: General Participation";
  };

  const downloadCSV = (data, type) => {
    let csvRows = [];
    if (type === 'participants') {
      csvRows.push(["ID", "Username", "Email", "Enrolled At"].join(","));
      data.forEach(p => {
        csvRows.push([p.id, `"${p.username}"`, `"${p.email}"`, `"${new Date(p.enrolled_at).toLocaleString()}"`].join(","));
      });
    } else if (type === 'teams') {
      csvRows.push(["Team ID", "Team Name", "Member Count", "Members"].join(","));
      data.forEach(t => {
        csvRows.push([t.id, `"${t.name}"`, t.member_count, `"${t.members.join(' | ')}"`].join(","));
      });
    }
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${event.title.replace(/\s+/g, '_')}_${type}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Event Header */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderColor: 'var(--primary)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '2rem', margin: 0 }}>{event.title}</h1>
            {myRoles.length > 0 && (
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {myRoles.map(r => (
                  <span key={r} className={`badge ${r === 'Organizer' ? 'badge-primary' : 'badge-accent'}`}>{r}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ background: 'var(--bg-input)', padding: '0.4rem 0.75rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--accent)' }}>
              {getPhaseStatus()}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Event: {new Date(event.start_date).toLocaleDateString()} – {new Date(event.end_date).toLocaleDateString()}
            <br />
            Registration Deadline: <strong style={{color: new Date() > new Date(event.registration_deadline) ? 'var(--danger)' : 'inherit'}}>{new Date(event.registration_deadline).toLocaleString()}</strong>
            <br />
            Organized by <strong>{event.organizer_name}</strong>
          </p>
          <p style={{ marginTop: '1rem', fontSize: '1rem' }}>{event.description}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column', flexShrink: 0 }}>
          {/* Participant actions — only if user has NO special role */}
          {user && isParticipant && (
            <>
              {isEnrolled ? (
                <button onClick={handleUnenroll} style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', boxShadow: 'none', transition: '0.2s' }}>Unenroll</button>
              ) : new Date() > new Date(event.registration_deadline) ? (
                <button disabled style={{ background: 'var(--bg-input)', cursor: 'not-allowed', color: 'var(--danger)', boxShadow: 'none' }}>Registration Closed</button>
              ) : event.participant_count >= event.participant_limit ? (
                <button disabled style={{ background: 'var(--bg-input)', cursor: 'not-allowed', color: 'var(--danger)', boxShadow: 'none' }}>Event Full</button>
              ) : (
                <button onClick={handleEnroll} style={{ background: 'var(--accent)' }}>Register for Event</button>
              )}
              {isEnrolled && <Link to={`/events/${id}/teams`}><button style={{ width: '100%' }}>Manage Teams</button></Link>}
            </>
          )}
          {/* Judge action */}
          {isJudge && (
            <Link to={`/events/${id}/judge`}><button style={{ width: '100%' }}>Evaluate Submissions</button></Link>
          )}
        </div>
      </div>

      {/* Current Active Phase Info */}
      {(() => {
        const now = new Date();
        const activeRound = event.rounds?.find(r => now >= new Date(r.start_time) && now <= new Date(r.end_time));
        if (activeRound) {
          return (
            <div className="card" style={{ marginTop: '1.25rem', borderColor: 'var(--accent)', background: 'var(--accent-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, color: 'var(--accent)' }}>Currently Active: Round {activeRound.sequence_order}</h3>
                <span className="badge badge-accent">{activeRound.submission_type}</span>
              </div>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>{activeRound.name}</h4>
              {activeRound.description && <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>{activeRound.description}</p>}
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Closes: {new Date(activeRound.end_time).toLocaleString()}
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Rounds */}
      {event.rounds && event.rounds.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '1rem' }}>Event Rounds</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {event.rounds.map((r) => (
              <div key={r.id} className="card" style={{ borderLeft: '4px solid var(--primary)', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <span style={{
                      background: 'var(--primary)', color: '#fff',
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, flexShrink: 0
                    }}>{r.sequence_order}</span>
                    <h4 style={{ margin: 0 }}>{r.name}</h4>
                    <span className="badge badge-accent">{r.submission_type}</span>
                  </div>
                  {isOrganizer && (
                    <button 
                      onClick={async () => {
                        try {
                          await axios.post(`http://localhost:5000/api/rounds/${r.id}/declare_results`, {}, { headers: { Authorization: `Bearer ${token}` } });
                          fetchEventData();
                        } catch(err) { alert('Error declaring results'); }
                      }}
                      style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      {r.results_declared ? 'Hide Results' : 'Declare Results'}
                    </button>
                  )}
                </div>
                {r.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2.75rem', marginBottom: '0.25rem' }}>{r.description}</p>}
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0 2.75rem' }}>
                  🕐 {new Date(r.start_time).toLocaleString()} → {new Date(r.end_time).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 2fr) minmax(280px, 1fr)', gap: '2rem', marginTop: '2rem' }}>
        <div>
          {/* ORGANIZER PANEL */}
          {isOrganizer && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Organizer Panel</h2>
              
              {/* Post Announcement */}
              <div className="card" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--primary)' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Post Announcement</h4>
                <form onSubmit={handlePostAnnouncement}>
                  <textarea value={newAnnouncement} onChange={(e) => setNewAnnouncement(e.target.value)} placeholder="Share updates with participants..." rows="3" required />
                  <button type="submit">Post Announcement</button>
                </form>
              </div>

              {/* Invite Team Members */}
              <div className="card" style={{ borderColor: 'var(--accent)' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Invite People</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Invite registered users by email to serve as judge, mentor, or co-organizer.
                </p>
                <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input
                    type="email" value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="User's registered email"
                    required style={{ flex: 2, minWidth: '200px', marginBottom: 0 }}
                  />
                  <select
                    value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}
                    style={{
                      flex: 1, minWidth: '120px', padding: '0.65rem 0.75rem',
                      borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                      background: 'var(--bg-input)', color: 'var(--text-main)',
                      fontSize: '0.9rem', marginBottom: 0
                    }}
                  >
                    <option value="Judge">Judge</option>
                    <option value="Mentor">Mentor</option>
                    <option value="Organizer">Co-Organizer</option>
                  </select>
                  <button type="submit" style={{ background: 'var(--accent)' }}>Invite</button>
                </form>
              </div>

              {/* Current Role Holders */}
              {teamMembers.length > 0 && (
                <div className="card">
                  <h4 style={{ marginBottom: '0.75rem' }}>Invited Team</h4>
                  {teamMembers.map(tm => (
                    <div key={tm.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.5rem 0', borderBottom: '1px solid var(--border)'
                    }}>
                      <div>
                        <strong>{tm.username}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{tm.email}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-primary">{tm.role}</span>
                        <button
                          onClick={() => handleRemoveRole(tm.id)}
                          style={{
                            background: 'transparent', border: '1px solid var(--danger)',
                            color: 'var(--danger)', padding: '0.2rem 0.5rem',
                            fontSize: '0.75rem', boxShadow: 'none'
                          }}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Announcements (visible to all) */}
          <h2 style={{ marginBottom: '1rem' }}>Announcements</h2>
          {announcements.map(a => (
            <div key={a.id} className="card" style={{ marginTop: '0.75rem' }}>
              <p style={{ fontSize: '1rem' }}>{a.content}</p>
              <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.5rem' }}>{new Date(a.created_at).toLocaleString()}</small>
            </div>
          ))}
          {announcements.length === 0 && <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>No announcements yet.</p>}

          {/* Mentorship Sessions */}
          <h2 style={{ marginBottom: '1rem', marginTop: '2.5rem' }}>Mentorship Sessions</h2>
          {isMentor && (
            <div className="card" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--accent)' }}>
              <h4 style={{ marginBottom: '0.5rem' }}>Offer a Mentorship Slot</h4>
              <form onSubmit={handleCreateSlot} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <input type="datetime-local" value={newSlotTime} onChange={(e) => setNewSlotTime(e.target.value)} required style={{ flex: 1, marginBottom: 0 }} />
                <input type="url" placeholder="Meeting Link (Zoom, Meet...)" value={newSlotLink} onChange={(e) => setNewSlotLink(e.target.value)} style={{ flex: 1, marginBottom: 0 }} />
                <button type="submit" style={{ background: 'var(--accent)' }}>Create Slot</button>
              </form>
            </div>
          )}
          
          <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
            {mentorships.map(m => (
              <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: 0 }}>{new Date(m.scheduled_time).toLocaleString()}</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Mentor: <strong>{m.mentor_name}</strong></p>
                  {m.team_name ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>Booked by: {m.team_name}</p>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--warning)' }}>Available</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {user && isParticipant && !m.team_name && (
                    <button onClick={() => handleBookSlot(m.id)}>Book Slot</button>
                  )}
                  {m.link && (m.team_name || isMentor) && (
                    <a href={m.link} target="_blank" rel="noreferrer"><button style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: 'none' }}>Join Meeting</button></a>
                  )}
                </div>
              </div>
            ))}
            {mentorships.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No mentorship slots published.</p>}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ marginTop: '2.5rem' }}>
              <h2 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Round Results</h2>
              {results.map((roundRes) => (
                <div key={roundRes.round_id} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{roundRes.round_name}</span>
                    {isOrganizer && !roundRes.results_declared && <span className="badge" style={{ background: 'var(--warning)', color: '#000', fontSize: '0.7rem' }}>Results Hidden</span>}
                  </h3>
                  {roundRes.results.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No evaluations completed for this round yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {roundRes.results.map((teamRes, i) => (
                        <div key={i} className="card" style={{ 
                          padding: '0.75rem', marginBottom: '0', 
                          borderColor: i === 0 ? '#eab308' : teamRes.is_promoted ? 'var(--accent)' : 'var(--border)' 
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <h4 style={{ margin: 0 }}>{i + 1}. {teamRes.team_name}</h4>
                              {isOrganizer && (
                                <button 
                                  onClick={async () => {
                                    try {
                                      await axios.post(`http://localhost:5000/api/submissions/${teamRes.submission_id}/promote`, {}, { headers: { Authorization: `Bearer ${token}` } });
                                      fetchEventData();
                                    } catch(err) { alert('Error updating promotion'); }
                                  }}
                                  style={{ background: teamRes.is_promoted ? 'transparent' : 'var(--accent)', border: teamRes.is_promoted ? '1px solid var(--accent)' : 'none', color: teamRes.is_promoted ? 'var(--accent)' : '#fff', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                >
                                  {teamRes.is_promoted ? '✓ Promoted' : 'Promote to Next'}
                                </button>
                              )}
                            </div>
                            <h3 style={{ margin: 0, color: 'var(--accent)' }}>{teamRes.avg_score}/100</h3>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          {event.rules && (
            <div className="card" style={{ borderColor: 'var(--primary)' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Rules</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{event.rules}</p>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: '1rem', color: 'var(--accent)' }}>Teams ({teams.length})</h3>
            {teams.length > 0 ? (
              <button 
                onClick={() => downloadCSV(teams, 'teams')} 
                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--accent)', color: 'var(--accent)', boxShadow: 'none' }}
              >
                Download Teams CSV
              </button>
            ) : (
              <p style={{ color: 'var(--text-muted)' }}>No teams formed yet.</p>
            )}
          </div>

          {isOrganizer && (
            <div className="card" style={{ marginTop: '1.25rem', borderColor: 'var(--primary)' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Enrolled Participants</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Total: {event.participant_count} / {event.participant_limit} 
                {event.participant_count >= event.participant_limit && <span style={{color: 'var(--danger)', marginLeft: '0.5rem'}}>(Full)</span>}
              </p>
              {participants.length > 0 ? (
                <button 
                  onClick={() => downloadCSV(participants, 'participants')} 
                  style={{ width: '100%', padding: '0.75rem', background: 'var(--primary)', color: '#fff', boxShadow: 'none' }}
                >
                  Download Participants CSV
                </button>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>No registrations yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventDetails;
