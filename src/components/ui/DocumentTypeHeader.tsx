import React from 'react';
import { Row, Col } from 'antd';

interface DocumentTypeHeaderProps {
  documentTypes: string[];
}

const DocumentTypeHeader: React.FC<DocumentTypeHeaderProps> = ({ documentTypes }) => {
  return (
    <Row style={{ height: '40px' }}>
      {documentTypes.map(type => (
        <Col
          key={type}
          span={4}
          style={{
            textAlign: 'center',
            fontWeight: 'bold',
            border: '1px solid #ddd',
            padding: '8px',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {type}
        </Col>
      ))}
    </Row>
  );
};

export default DocumentTypeHeader;
