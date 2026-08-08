import React, { useState, useContext, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

function Submission() {
  const { eventId, teamId } = useParams();
  const [details, setDetails] = useState('');
  const [github, setGithub] = useState('');
  const [demo, setDemo] = useState('');
  const [docs, setDocs] = useState('');
  const [rounds, setRounds] = useState([]);
  const [selectedRound, setSelectedRound] = useState('');
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRounds = async () => {
      if (!token) return;
      try {
        const res = await axios.get(`http://localhost:5000/api/teams/${teamId}/available_rounds`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setRounds(res.data);
        if (res.data.length > 0) setSelectedRound(res.data[0].id);
      } catch (err) {
        console.error("Failed to fetch rounds:", err);
      }
    };
    fetchRounds();
  }, [teamId, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRound) return alert('Please select a round first');
    try {
      await axios.post(`http://localhost:5000/api/teams/${teamId}/rounds/${selectedRound}/submit`, {
        project_details: details,
        github_link: github,
        demo_link: demo,
        documentation_link: docs
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Project submitted successfully!');
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.msg || 'Error submitting project');
    }
  };

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h2>Submit Project</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: '1.25rem' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <label>Select Round</label>
          <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value)} required style={{ width: '100%', padding: '0.85rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-main)', marginTop: '0.5rem' }}>
            <option value="" disabled>-- Choose a Round --</option>
            {rounds.map(r => (
              <option key={r.id} value={r.id}>Round {r.sequence_order}: {r.name} ({r.submission_type})</option>
            ))}
          </select>
        </div>
        <div>
          <label>Project Details / Summary</label>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows="5" required />
        </div>
        <div>
          <label>GitHub Link</label>
          <input type="url" value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/..." />
        </div>
        <div>
          <label>Demo Link</label>
          <input type="url" value={demo} onChange={(e) => setDemo(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label>Documentation Link</label>
          <input type="url" value={docs} onChange={(e) => setDocs(e.target.value)} placeholder="Google Drive, Notion..." />
        </div>
        <button type="submit">Submit Project</button>
      </form>
    </div>
  );
}

export default Submission;
