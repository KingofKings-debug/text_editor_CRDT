import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

function TeamManagement() {
  const { eventId } = useParams();
  const [teams, setTeams] = useState([]);
  const [myTeam, setMyTeam] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const { token, user } = useContext(AuthContext);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const res = await axios.get(`http://localhost:5000/api/events/${eventId}/teams`);
      setTeams(res.data);

      if (user && token) {
        const myRes = await axios.get(`http://localhost:5000/api/events/${eventId}/my_team`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (myRes.data.team_id) {
          setMyTeam(myRes.data);
          try {
            const subRes = await axios.get(`http://localhost:5000/api/teams/${myRes.data.team_id}/submissions`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            setSubmissions(subRes.data);
          } catch(e) {}
        } else {
          setMyTeam(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [eventId, user]);

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!confirm(`Are you sure you want to create and join team "${newTeamName}"?\n\n⚠️ This is permanent — you will not be able to leave or switch teams after this.`)) return;
    try {
      await axios.post(`http://localhost:5000/api/events/${eventId}/teams`, { name: newTeamName }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewTeamName('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error creating team');
    }
  };

  const handleJoinTeam = async (teamId, teamName) => {
    if (!confirm(`Are you sure you want to join team "${teamName}"?\n\n⚠️ This is permanent — you will not be able to leave or switch teams after this.`)) return;
    try {
      await axios.post(`http://localhost:5000/api/teams/${teamId}/join`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error joining team');
    }
  };

  const isInTeam = myTeam !== null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)' }}>Team Management</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Create a new team or join an existing one. <strong>Team selection is permanent</strong>.</p>
        </div>
        <Link to={`/event/${eventId}`}><button style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: 'none' }}>Back to Event</button></Link>
      </div>

      {isInTeam && (
        <div className="card" style={{ borderColor: 'var(--accent)', background: 'var(--accent-light)', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ color: 'var(--accent)', marginBottom: '0.25rem' }}>Your Team: {myTeam.team_name}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Members: {myTeam.members.map(m => m.username).join(', ')}</p>
          </div>
          <button onClick={() => navigate(`/events/${eventId}/teams/${myTeam.team_id}/submit`)} style={{ background: 'var(--accent)' }}>Submit Project</button>
        </div>
      )}

      {isInTeam && submissions.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Team Submissions History</h3>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {submissions.map(s => (
              <div key={s.id} className="card" style={{ padding: '1rem', marginBottom: 0, borderLeft: s.is_promoted ? '4px solid var(--accent)' : '4px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>Round {s.sequence_order}: {s.round_name}</h4>
                  {s.is_promoted && <span className="badge badge-accent">Promoted to Next</span>}
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>{s.project_details}</p>
                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.85rem' }}>
                  {s.github_link && <a href={s.github_link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>GitHub</a>}
                  {s.demo_link && <a href={s.demo_link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Demo</a>}
                  {s.documentation_link && <a href={s.documentation_link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Docs</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)', gap: '2rem' }}>
        <div>
          <div className="card" style={{ position: 'sticky', top: '80px', borderColor: isInTeam ? 'var(--border)' : 'var(--primary)', opacity: isInTeam ? 0.5 : 1 }}>
            <h3 style={{ marginBottom: '1rem' }}>Form a New Team</h3>
            {isInTeam ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>You are already in a team. Team selection is permanent.</p>
            ) : (
              <form onSubmit={handleCreateTeam}>
                <label>Team Name</label>
                <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="e.g. Byte Builders" required />
                <button type="submit" style={{ width: '100%' }}>Create Team</button>
              </form>
            )}
          </div>
        </div>

        <div>
          <h3 style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>All Teams</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {teams.map(t => {
              const isMyTeam = myTeam && myTeam.team_id === t.id;
              return (
                <div key={t.id} className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderColor: isMyTeam ? 'var(--accent)' : 'var(--border)' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ fontSize: '1.15rem', color: isMyTeam ? 'var(--accent)' : 'var(--text-heading)', margin: 0 }}>{t.name}</h4>
                      {isMyTeam && <span className="badge badge-accent">Your Team</span>}
                    </div>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
                      <strong>{t.member_count}</strong> {t.member_count === 1 ? 'member' : 'members'}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.members.join(', ')}</p>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    {isMyTeam ? (
                      <button onClick={() => navigate(`/events/${eventId}/teams/${t.id}/submit`)} style={{ width: '100%', padding: '0.5rem', background: 'var(--accent)' }}>Submit Project</button>
                    ) : isInTeam ? (
                      <button disabled style={{ width: '100%', padding: '0.5rem' }}>Already in a team</button>
                    ) : (
                      <button onClick={() => handleJoinTeam(t.id, t.name)} style={{ width: '100%', padding: '0.5rem' }}>Join Team</button>
                    )}
                  </div>
                </div>
              );
            })}
            {teams.length === 0 && (
              <div className="card" style={{ opacity: 0.7 }}>
                <p>No teams have been formed yet. Be the first!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamManagement;
