import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProjectListPage from './pages/ProjectListPage';
import CreateProjectPage from './pages/CreateProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import TemplatePage from './pages/TemplatePage';
import Sidebar from './components/Sidebar';

const App: React.FC = () => {
  return (
    <Router>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar />
        <div style={{ marginLeft: '180px', flex: 1, padding: '24px', width: 'calc(100% - 180px)' }}>
          <Routes>
            <Route path="/" element={<ProjectListPage />} />
            <Route path="/projects/new" element={<CreateProjectPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/templates" element={<TemplatePage />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;