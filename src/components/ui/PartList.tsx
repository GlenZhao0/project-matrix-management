import React from 'react';
import { List } from 'antd';
import { MatrixPart } from '../../api/matrix';

interface PartListProps {
  parts: MatrixPart[];
}

const PartList: React.FC<PartListProps> = ({ parts }) => {
  const data = parts.flatMap(part => [
    { id: `${part.id}-external`, name: `${part.part_name} / 外来文件` },
    { id: `${part.id}-internal`, name: `${part.part_name} / 内部文件` },
  ]);

  return (
    <List
      size="small"
      dataSource={data}
      renderItem={(item) => (
        <List.Item style={{ height: '60px', display: 'flex', alignItems: 'center', border: '1px solid #ddd', padding: '8px' }}>
          {item.name}
        </List.Item>
      )}
    />
  );
};

export default PartList;
