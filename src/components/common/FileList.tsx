import React from 'react';
import { List } from 'antd';

interface BaseFile {
  id: string;
}

interface PendingFile extends BaseFile {
  name: string;
}

interface HistoryFile extends BaseFile {
  filename?: string;
  uploaded_at?: string;
  uploadDate?: string;
  remark?: string;
  remarks?: string;
  is_latest?: boolean;
}

interface FileListProps {
  files: Array<PendingFile | HistoryFile>;
  title: string;
}

const FileList: React.FC<FileListProps> = ({ files, title }) => {
  return (
    <div>
      {title && <h4>{title}</h4>}
      <List
        size="small"
        dataSource={files}
        renderItem={(item) => {
          if ('name' in item) {
            return (
              <List.Item>
                <span>{item.name}</span>
              </List.Item>
            );
          }

          const title = item.filename ?? '';
          const uploadDate = item.uploaded_at ?? item.uploadDate;
          const remarkText = item.remark ?? item.remarks;

          return (
            <List.Item>
              <span>
                {title} {uploadDate ? `- ${new Date(uploadDate).toLocaleDateString('zh-CN')}` : ''} {remarkText ? `- ${remarkText}` : ''}
              </span>
            </List.Item>
          );
        }}
      />
    </div>
  );
};

export default FileList;
