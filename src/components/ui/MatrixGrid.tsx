import React from 'react';
import { Row, Col } from 'antd';
import { MatrixPart, MatrixSlot } from '../../api/matrix';

interface MatrixGridProps {
  parts: MatrixPart[];
  documentTypes: string[];
  slots: MatrixSlot[];
  onCellClick: (slotId: string) => void;
}

const MatrixGrid: React.FC<MatrixGridProps> = ({ parts, documentTypes, slots, onCellClick }) => {
  // 为每个 Part 生成两行：external 和 internal
  const rows = parts.flatMap(part => [
    { partId: part.id, type: 'external' },
    { partId: part.id, type: 'internal' },
  ]);

  return (
    <div>
      {rows.map(row => (
        <Row key={`${row.partId}-${row.type}`} style={{ height: '60px' }}>
          {documentTypes.map(docType => {
            // 查找对应的 slot
            const slot = slots.find(
              s => s.part_id === row.partId && s.group_type === row.type && s.document_type === docType
            );

            return (
              <Col
                key={docType}
                span={4}
                style={{
                  border: '1px solid #ddd',
                  padding: '8px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: slot?.has_file ? '#e6f7ff' : '#fff',
                  minHeight: '60px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
                onClick={() => slot && onCellClick(slot.slot_id)}
              >
                <div>{slot?.has_file ? '有文件' : '无文件'}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {slot?.latest_upload_at ? new Date(slot.latest_upload_at).toLocaleDateString('zh-CN') : ''}
                </div>
              </Col>
            );
          })}
        </Row>
      ))}
    </div>
  );
};

export default MatrixGrid;
