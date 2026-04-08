import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { label: '项目清单', path: '/' },
    { label: '模板', path: '/templates' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div
      style={{
        width: '180px',
        backgroundColor: '#f5f5f5',
        borderRight: '1px solid #e8e8e8',
        minHeight: '100vh',
        padding: '20px 0',
        position: 'fixed',
        left: 0,
        top: 0,
        overflowY: 'auto',
      }}
    >
      <div style={{ paddingLeft: '20px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>
          项目管理
        </h2>
      </div>
      <div>
        {menuItems.map((item) => (
          <div
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              padding: '12px 20px',
              cursor: 'pointer',
              fontSize: '14px',
              color: isActive(item.path) ? '#1890ff' : '#4b5563',
              backgroundColor: isActive(item.path) ? '#e6f7ff' : 'transparent',
              borderLeft: isActive(item.path) ? '3px solid #1890ff' : '3px solid transparent',
              fontWeight: isActive(item.path) ? 600 : 400,
              transition: 'all 0.2s ease',
            }}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
