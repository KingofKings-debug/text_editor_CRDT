import React, { useState, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SUBMISSION_TYPES = ['Project', 'Presentation', 'Document', 'Code', 'Demo', 'Quiz', 'Other'];

function CreateEvent() {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  // Step tracking: 1 = event details, 2 = add rounds, 3 = review & publish
  const [step, setStep] = useState(1);

  // Event details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [registrationDeadline, setRegistrationDeadline] = useState('');
  const [participantLimit, setParticipantLimit] = useState(100);
  const [rules, setRules] = useState('');
  const [eventId, setEventId] = useState(null);

  // Rounds
  const [rounds, setRounds] = useState([]);
  const [roundName, setRoundName] = useState('');
  const [roundDesc, setRoundDesc] = useState('');
  const [roundStart, setRoundStart] = useState('');
  const [roundEnd, setRoundEnd] = useState('');
  const [roundSubmissionType, setRoundSubmissionType] = useState('Project');
  const [addingRound, setAddingRound] = useState(false);

  const [error, setError] = useState('');
  const [publishing, setPublishing] = useState(false);

  // Step 1: Create event as draft
  const handleCreateDraft = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post('http://localhost:5000/api/events', {
        title, description, start_date: startDate, end_date: endDate, 
        registration_deadline: registrationDeadline || startDate,
        participant_limit: parseInt(participantLimit, 10),
        rules
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEventId(res.data.id);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.msg || 'Error creating event');
    }
  };

  // Step 2: Add a round
  const handleAddRound = async (e) => {
    e.preventDefault();
    setError('');
    
    if (rounds.length > 0) {
      const lastRoundEnd = new Date(rounds[rounds.length - 1].end_time);
      const newRoundStart = new Date(roundStart);
      if (newRoundStart < lastRoundEnd) {
         setError(`This round must start after the previous round ends (${lastRoundEnd.toLocaleString()})`);
         return;
      }
    }
    
    try {
      const res = await axios.post(`http://localhost:5000/api/events/${eventId}/rounds`, {
        name: roundName,
        description: roundDesc,
        start_time: roundStart,
        end_time: roundEnd,
        submission_type: roundSubmissionType
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRounds([...rounds, {
        id: res.data.id,
        name: roundName,
        description: roundDesc,
        start_time: roundStart,
        end_time: roundEnd,
        submission_type: roundSubmissionType,
        sequence_order: res.data.sequence_order
      }]);
      // Reset round form
      setRoundName('');
      setRoundDesc('');
      setRoundStart('');
      setRoundEnd('');
      setRoundSubmissionType('Project');
      setAddingRound(false);
    } catch (err) {
      setError(err.response?.data?.msg || 'Error adding round');
    }
  };

  // Delete a round
  const handleDeleteRound = async (roundId) => {
    if (!confirm('Delete this round?')) return;
    try {
      await axios.delete(`http://localhost:5000/api/rounds/${roundId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRounds(rounds.filter(r => r.id !== roundId));
    } catch (err) {
      alert(err.response?.data?.msg || 'Error deleting round');
    }
  };

  // Step 3: Publish
  const handlePublish = async () => {
    setPublishing(true);
    setError('');
    try {
      await axios.post(`http://localhost:5000/api/events/${eventId}/publish`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Event published successfully! 🎉');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.msg || 'Error publishing event');
      setPublishing(false);
    }
  };

  // Step indicator
  const StepIndicator = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
      {[
        { num: 1, label: 'Event Details' },
        { num: 2, label: 'Add Rounds' },
        { num: 3, label: 'Review & Publish' }
      ].map((s, i) => (
        <React.Fragment key={s.num}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            opacity: step >= s.num ? 1 : 0.4
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.85rem', fontWeight: 700,
              background: step > s.num ? 'var(--accent)' : step === s.num ? 'var(--primary)' : 'var(--bg-input)',
              color: step >= s.num ? '#fff' : 'var(--text-muted)',
              border: step === s.num ? '2px solid var(--primary)' : '1px solid var(--border)',
              transition: 'all 0.3s ease'
            }}>
              {step > s.num ? '✓' : s.num}
            </div>
            <span style={{
              fontSize: '0.85rem', fontWeight: step === s.num ? 600 : 400,
              color: step === s.num ? 'var(--text-heading)' : 'var(--text-muted)'
            }}>{s.label}</span>
          </div>
          {i < 2 && <div style={{
            width: 40, height: 2,
            background: step > s.num ? 'var(--accent)' : 'var(--border)',
            transition: 'background 0.3s ease'
          }} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Create Hackathon</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Set up your event details, add rounds, then publish when ready.
      </p>

      <StepIndicator />

      {error && (
        <div style={{
          padding: '0.75rem 1rem', background: 'var(--danger-light)', color: 'var(--danger)',
          borderRadius: 'var(--radius)', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: 500
        }}>
          {error}
        </div>
      )}

      {/* ===== STEP 1: Event Details ===== */}
      {step === 1 && (
        <div className="card">
          <h3 style={{ marginBottom: '1.25rem' }}>Event Details</h3>
          <form onSubmit={handleCreateDraft}>
            <div>
              <label>Event Title</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AI Innovation Hackathon 2026" required />
            </div>
            <div>
              <label>Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows="4" placeholder="What is this hackathon about?" required />
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>Start Date</label>
                <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label>End Date</label>
                <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} required />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label>Registration Deadline</label>
                <input type="datetime-local" value={registrationDeadline} onChange={(e) => setRegistrationDeadline(e.target.value)} max={startDate} required />
              </div>
              <div style={{ flex: 1 }}>
                <label>Participant Limit</label>
                <input type="number" min="1" value={participantLimit} onChange={(e) => setParticipantLimit(e.target.value)} required />
              </div>
            </div>
            <div>
              <label>Rules <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
              <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows="3" placeholder="Any specific rules or guidelines..." />
            </div>
            <button type="submit" style={{ width: '100%' }}>Save & Continue →</button>
          </form>
        </div>
      )}

      {/* ===== STEP 2: Add Rounds ===== */}
      {step === 2 && (
        <div>
          <div className="card" style={{ background: 'var(--bg-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: '0.25rem' }}>Event Rounds</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  Add the rounds/phases for your hackathon. They will run in sequence.
                </p>
              </div>
              <span className="badge badge-primary" style={{ fontSize: '0.8rem' }}>{rounds.length} round{rounds.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Existing round cards */}
          {rounds.map((r, i) => (
            <div key={r.id} className="card" style={{ 
              borderLeft: '4px solid var(--primary)', 
              position: 'relative',
              marginTop: i === 0 ? '1rem' : '0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{
                      background: 'var(--primary)', color: '#fff',
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700, flexShrink: 0
                    }}>{r.sequence_order}</span>
                    <h4 style={{ margin: 0 }}>{r.name}</h4>
                  </div>
                  {r.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem', marginLeft: '2.75rem' }}>
                      {r.description}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '1rem', marginLeft: '2.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      🕐 {new Date(r.start_time).toLocaleString()} → {new Date(r.end_time).toLocaleString()}
                    </span>
                    <span className="badge badge-accent">{r.submission_type}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteRound(r.id)}
                  style={{
                    background: 'transparent', border: '1px solid var(--danger)',
                    color: 'var(--danger)', padding: '0.35rem 0.75rem',
                    fontSize: '0.8rem', boxShadow: 'none', flexShrink: 0
                  }}
                >✕</button>
              </div>
            </div>
          ))}

          {/* Connector line between cards */}
          {rounds.length > 0 && !addingRound && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0' }}>
              <div style={{ width: 2, height: 24, background: 'var(--border)' }} />
            </div>
          )}

          {/* Add round form */}
          {addingRound ? (
            <div className="card" style={{ borderColor: 'var(--primary)', borderStyle: 'dashed' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>
                Round {rounds.length + 1}
              </h4>
              <form onSubmit={handleAddRound}>
                <div>
                  <label>Round Name</label>
                  <input type="text" value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="e.g. Ideation Phase, Prototype Sprint, Final Demo" required />
                </div>
                <div>
                  <label>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(what participants should do)</span></label>
                  <textarea value={roundDesc} onChange={(e) => setRoundDesc(e.target.value)} rows="3" placeholder="Describe the objectives and expectations for this round..." />
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <label>Start Time</label>
                    <input type="datetime-local" value={roundStart} onChange={(e) => setRoundStart(e.target.value)} min={startDate} max={endDate} required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label>End Time</label>
                    <input type="datetime-local" value={roundEnd} onChange={(e) => setRoundEnd(e.target.value)} min={startDate} max={endDate} required />
                  </div>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                  Round dates must fall within event dates: {new Date(startDate).toLocaleDateString()} – {new Date(endDate).toLocaleDateString()}
                </p>
                <div>
                  <label>Submission Type</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
                    {SUBMISSION_TYPES.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRoundSubmissionType(type)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: 'var(--radius)',
                          border: roundSubmissionType === type ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: roundSubmissionType === type ? 'var(--primary-light)' : 'var(--bg-input)',
                          color: roundSubmissionType === type ? 'var(--primary)' : 'var(--text-muted)',
                          fontWeight: roundSubmissionType === type ? 600 : 400,
                          fontSize: '0.85rem',
                          boxShadow: 'none',
                          cursor: 'pointer'
                        }}
                      >{type}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" style={{ flex: 1 }}>Add Round</button>
                  <button type="button" onClick={() => setAddingRound(false)} style={{ 
                    flex: 1, background: 'var(--bg-card)', color: 'var(--text-main)', 
                    border: '1px solid var(--border)', boxShadow: 'none' 
                  }}>Cancel</button>
                </div>
              </form>
            </div>
          ) : (
            <button
              onClick={() => setAddingRound(true)}
              style={{
                width: '100%',
                padding: '0.85rem',
                background: 'var(--bg-card)',
                border: '2px dashed var(--border)',
                color: 'var(--primary)',
                fontWeight: 600,
                boxShadow: 'none',
                marginBottom: '1.25rem'
              }}
            >
              + Add Round {rounds.length > 0 ? `(Round ${rounds.length + 1})` : ''}
            </button>
          )}

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={() => {
                if (rounds.length === 0) {
                  setError('Add at least one round before continuing');
                  return;
                }
                setError('');
                setStep(3);
              }}
              style={{ flex: 1 }}
            >Continue to Review →</button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: Review & Publish ===== */}
      {step === 3 && (
        <div>
          <div className="card" style={{ borderColor: 'var(--primary)' }}>
            <h3 style={{ marginBottom: '1rem' }}>Review Your Event</h3>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Title</label>
              <h2 style={{ margin: 0 }}>{title}</h2>
            </div>

            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Start Date</label>
                <p style={{ fontWeight: 500, margin: 0 }}>{new Date(startDate).toLocaleString()}</p>
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>End Date</label>
                <p style={{ fontWeight: 500, margin: 0 }}>{new Date(endDate).toLocaleString()}</p>
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Registration Deadline</label>
                <p style={{ fontWeight: 500, margin: 0 }}>{new Date(registrationDeadline || startDate).toLocaleString()}</p>
              </div>
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Participant Limit</label>
                <p style={{ fontWeight: 500, margin: 0 }}>{participantLimit}</p>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Description</label>
              <p style={{ margin: 0 }}>{description}</p>
            </div>

            {rules && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.15rem' }}>Rules</label>
                <p style={{ margin: 0 }}>{rules}</p>
              </div>
            )}
          </div>

          <h3 style={{ marginBottom: '1rem', marginTop: '1.5rem' }}>
            {rounds.length} Round{rounds.length !== 1 ? 's' : ''}
          </h3>

          {rounds.map((r) => (
            <div key={r.id} className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <span style={{
                  background: 'var(--primary)', color: '#fff',
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.8rem', fontWeight: 700
                }}>{r.sequence_order}</span>
                <h4 style={{ margin: 0 }}>{r.name}</h4>
                <span className="badge badge-accent">{r.submission_type}</span>
              </div>
              {r.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '2.75rem', marginBottom: '0.35rem' }}>{r.description}</p>}
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '2.75rem', margin: '0 0 0 2.75rem' }}>
                🕐 {new Date(r.start_time).toLocaleString()} → {new Date(r.end_time).toLocaleString()}
              </p>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              onClick={() => setStep(2)}
              style={{
                flex: 1, background: 'var(--bg-card)', color: 'var(--text-main)',
                border: '1px solid var(--border)', boxShadow: 'none'
              }}
            >← Back to Rounds</button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{ flex: 1, background: 'var(--accent)' }}
            >
              {publishing ? 'Publishing...' : '🚀 Publish Event'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateEvent;
