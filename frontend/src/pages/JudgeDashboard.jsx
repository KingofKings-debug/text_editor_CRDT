import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

function JudgeDashboard() {
  const { eventId } = useParams();
  const [submissions, setSubmissions] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState('');
  const [myRoles, setMyRoles] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const { token } = useContext(AuthContext);

  const fetchData = async () => {
    try {
      const [subRes, roundRes, roleRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/events/${eventId}/submissions`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`http://localhost:5000/api/events/${eventId}/rounds`),
        axios.get(`http://localhost:5000/api/events/${eventId}/my_roles`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSubmissions(subRes.data);
      setRounds(roundRes.data);
      setMyRoles(roleRes.data.roles || []);
      if (roundRes.data.length > 0 && !selectedRoundId) {
        setSelectedRoundId(roundRes.data[0].id.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [eventId]);

  const handleSubmitEvaluation = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`http://localhost:5000/api/submissions/${selectedSub.id}/evaluate`, {
        score: parseInt(score),
        feedback
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Evaluation saved successfully!');
      setSelectedSub(null);
      setScore('');
      setFeedback('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.msg || 'Error saving evaluation');
    }
  };

  const isOnlyMentor = myRoles.includes('Mentor') && !myRoles.includes('Judge') && !myRoles.includes('Organizer');
  const filteredSubmissions = submissions.filter(s => s.round_id.toString() === selectedRoundId);
  const pending = filteredSubmissions.filter(s => !s.has_evaluated);
  const evaluated = filteredSubmissions.filter(s => s.has_evaluated);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ color: 'var(--primary)' }}>Review Submissions</h2>
        <Link to={`/event/${eventId}`}><button style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: 'none' }}>Back to Event</button></Link>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Review participant team submissions per round. Mentors can view submissions without evaluating.
      </p>

      {rounds.length > 0 && (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem' }}>
          <label style={{ fontWeight: 600 }}>Select Round:</label>
          <select value={selectedRoundId} onChange={(e) => { setSelectedRoundId(e.target.value); setSelectedSub(null); }} style={{ padding: '0.5rem', borderRadius: 'var(--radius)', background: 'var(--bg-input)' }}>
            {rounds.map(r => (
              <option key={r.id} value={r.id}>Round {r.sequence_order}: {r.name}</option>
            ))}
          </select>
        </div>
      )}

      {filteredSubmissions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', opacity: 0.7 }}>
          <h3>No Submissions Found</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Participant teams have not submitted any projects for this round yet. Check back later.
          </p>
        </div>
      )}

      {filteredSubmissions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 2fr)', gap: '2rem' }}>
          <div>
            {pending.length > 0 && (
              <>
                <h4 style={{ color: 'var(--warning)', marginBottom: '0.75rem' }}>⏳ Pending Review ({pending.length})</h4>
                {pending.map(sub => (
                  <div 
                    key={sub.id} 
                    className="card"
                    style={{ cursor: 'pointer', borderColor: selectedSub?.id === sub.id ? 'var(--primary)' : 'var(--border)', marginBottom: '0.75rem' }}
                    onClick={() => setSelectedSub(sub)}
                  >
                    <h4 style={{ color: 'var(--accent)', marginBottom: '0.25rem' }}>{sub.team_name}</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Participants: {sub.members.join(', ')}
                    </p>
                    {sub.submitted_at && (
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, marginTop: '0.25rem' }}>
                        Submitted: {new Date(sub.submitted_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}

            {evaluated.length > 0 && (
              <>
                <h4 style={{ color: 'var(--accent)', marginBottom: '0.75rem', marginTop: pending.length > 0 ? '1.5rem' : 0 }}>✅ Evaluated ({evaluated.length})</h4>
                {evaluated.map(sub => (
                  <div 
                    key={sub.id} 
                    className="card"
                    style={{ cursor: 'pointer', borderColor: selectedSub?.id === sub.id ? 'var(--primary)' : 'var(--border)', marginBottom: '0.75rem', opacity: 0.7 }}
                    onClick={() => setSelectedSub(sub)}
                  >
                    <h4 style={{ color: 'var(--accent)', marginBottom: '0.25rem' }}>{sub.team_name}</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                      Participants: {sub.members.join(', ')}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>

          <div>
            {selectedSub ? (
              <div className="card" style={{ position: 'sticky', top: '80px', borderColor: 'var(--primary)' }}>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0 }}>Submission by Team: {selectedSub.team_name}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                    Participant members: <strong>{selectedSub.members.join(', ')}</strong>
                  </p>
                  {selectedSub.submitted_at && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.25rem 0 0 0' }}>
                      Submitted at: {new Date(selectedSub.submitted_at).toLocaleString()}
                    </p>
                  )}
                </div>
                
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Project Details:</p>
                  <div className="section-elevated">
                    {selectedSub.project_details}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
                  {selectedSub.github_link && <a href={selectedSub.github_link} target="_blank" rel="noreferrer"><button style={{ background: '#24292e' }}>GitHub</button></a>}
                  {selectedSub.demo_link && <a href={selectedSub.demo_link} target="_blank" rel="noreferrer"><button style={{ background: 'var(--accent)' }}>Live Demo</button></a>}
                  {selectedSub.documentation_link && <a href={selectedSub.documentation_link} target="_blank" rel="noreferrer"><button style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)', boxShadow: 'none' }}>Docs</button></a>}
                </div>

                {isOnlyMentor ? (
                  <div style={{ padding: '1rem', background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                    📖 Mentors have view-only access to submissions.
                  </div>
                ) : selectedSub.has_evaluated ? (
                  <div style={{ padding: '1rem', background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 'var(--radius)', textAlign: 'center', fontWeight: 500 }}>
                    ✅ You have already submitted your evaluation for this participant team's submission.
                  </div>
                ) : (
                  <form onSubmit={handleSubmitEvaluation}>
                    <h4 style={{ marginBottom: '1rem' }}>Evaluate this Participant Submission</h4>
                    <div>
                      <label>Score (0-100)</label>
                      <input type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} required />
                    </div>
                    <div>
                      <label>Feedback for Participants</label>
                      <textarea rows="4" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Provide constructive feedback for the participant team..." required></textarea>
                    </div>
                    <button type="submit" style={{ width: '100%' }}>Submit Evaluation</button>
                  </form>
                )}
              </div>
            ) : (
              <div className="card" style={{ opacity: 0.7, textAlign: 'center', padding: '3rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>Select a Participant Submission</h3>
                <p style={{ color: 'var(--text-muted)' }}>Click on a team's submission from the left panel to review their project and provide your evaluation.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JudgeDashboard;
