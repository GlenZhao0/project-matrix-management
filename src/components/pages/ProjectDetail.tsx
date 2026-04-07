import React, { useState } from 'react';
import { Row, Col } from 'antd';
import { MatrixPart, MatrixSlot } from '../../api/matrix';
import PartList from '../ui/PartList';
import DocumentTypeHeader from '../ui/DocumentTypeHeader';
import MatrixGrid from '../ui/MatrixGrid';
import DocumentSlotModal from './DocumentSlotModal';
import Button from '../common/Button';

interface ProjectDetailProps {
  projectId: string;
  parts: MatrixPart[];
  documentTypes: string[];
  slots: MatrixSlot[];
  onBack: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({
  projectId,
  parts,
  documentTypes,
  slots,
  onBack,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedSlotTitle, setSelectedSlotTitle] = useState<string>('');

  const handleCellClick = (slotId: string) => {
    const slot = slots.find(s => s.slot_id === slotId);
    if (!slot) return;
    
    const part = parts.find(p => p.id === slot.part_id);
    const title = part ? `${part.part_name} / ${slot.group_type === 'external' ? '外来文件' : '内部文件'} / ${slot.document_type}` : '';
    
    setSelectedSlotId(slotId);
    setSelectedSlotTitle(title);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setSelectedSlotId(null);
    setSelectedSlotTitle('');
  };

  return (
    <div>
      <Button onClick={onBack} style={{ marginBottom: '16px' }}>返回</Button>
      <h1>项目详情 - 矩阵页（ID: {projectId}）</h1>
      <Row gutter={16}>
        <Col span={6} style={{ minWidth: '200px' }}>
          <PartList parts={parts} />
        </Col>
        <Col span={18}>
          <DocumentTypeHeader documentTypes={documentTypes} />
          <MatrixGrid
            parts={parts}
            documentTypes={documentTypes}
            slots={slots}
            onCellClick={handleCellClick}
          />
        </Col>
      </Row>
      {selectedSlotId && (
        <DocumentSlotModal
          slotId={selectedSlotId}
          visible={modalVisible}
          title={selectedSlotTitle}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
};

export default ProjectDetail;