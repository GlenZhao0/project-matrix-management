import React, { useState, useEffect, useRef } from 'react';
import { Input, Spin, Empty, message, List } from 'antd';
import Modal from '../common/Modal';
import FileList from '../common/FileList';
import Button from '../common/Button';
import { getSlotFiles, FileRecord, getSlotDetail, SlotDetail, openFolder, getStagingFiles, StagingFile, importFromStaging, ImportFromStagingRequest, openLatestFile, uploadFile } from '../../api/matrix';

interface DocumentSlotModalProps {
  slotId: string;
  visible: boolean;
  title: string;
  onClose: () => void;
}

const DocumentSlotModal: React.FC<DocumentSlotModalProps> = ({ slotId, visible, title, onClose }) => {
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [slotDetail, setSlotDetail] = useState<SlotDetail | null>(null);
  const [stagingFiles, setStagingFiles] = useState<StagingFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!visible || !slotId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [filesList, detail, staging] = await Promise.all([
          getSlotFiles(slotId),
          getSlotDetail(slotId),
          getStagingFiles(),
        ]);
        setFiles(filesList);
        setSlotDetail(detail);
        setStagingFiles(staging);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '获取数据失败';
        setError(errorMsg);
        console.error('获取数据出错:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [visible, slotId]);

  const handleOpenFolder = async () => {
    if (!slotDetail) return;
    try {
      await openFolder(slotId);
      message.success('目录已打开');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '打开目录失败';
      message.error(errorMsg);
      console.error('打开目录出错:', err);
    }
  };

  const handleImportFile = async (stagingFile: StagingFile) => {
    try {
      const request: ImportFromStagingRequest = {
        staging_file_path: stagingFile.full_path,
        remark: remarks || undefined,
      };
      await importFromStaging(slotId, request);
      message.success('文件导入成功');

      // 刷新数据
      const [filesList, detail, staging] = await Promise.all([
        getSlotFiles(slotId),
        getSlotDetail(slotId),
        getStagingFiles(),
      ]);
      setFiles(filesList);
      setSlotDetail(detail);
      setStagingFiles(staging);
      setRemarks('');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导入失败';
      message.error(errorMsg);
      console.error('导入出错:', err);
    }
  };

  const handleUploadFile = async (file: File) => {
    if (!file) {
      message.error('请选择文件');
      return;
    }

    try {
      await uploadFile(slotId, file, remarks || undefined);
      message.success('文件上传成功');

      const [filesList, detail, staging] = await Promise.all([
        getSlotFiles(slotId),
        getSlotDetail(slotId),
        getStagingFiles(),
      ]);
      setFiles(filesList);
      setSlotDetail(detail);
      setStagingFiles(staging);
      setRemarks('');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '上传失败';
      message.error(errorMsg);
      console.error('上传出错:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenLatestFile = async () => {
    if (!slotDetail) return;
    try {
      await openLatestFile(slotId);
      message.success('文件已打开');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '打开文件失败';
      message.error(errorMsg);
      console.error('打开文件出错:', err);
    }
  };

  const getTargetFolderDisplay = () => {
    if (!slotDetail) return '加载中...';
    if (!slotDetail.target_folder_path) return '项目根目录未设置';
    if (!slotDetail.target_folder_exists) return '目标目录不存在';
    return slotDetail.target_folder_path;
  };

  const canOpenFolder = slotDetail?.target_folder_path && slotDetail.target_folder_exists;
  const canOpenLatestFile = !!slotDetail?.latest_filename;

  if (loading) {
    return (
      <Modal title={title} open={visible} onCancel={onClose}>
        <Spin size="large" tip="加载中..." />
      </Modal>
    );
  }

  return (
    <Modal title={title} open={visible} onCancel={onClose}>
      <div style={{ marginBottom: '16px' }}>
        <strong>目标目录路径：</strong>{getTargetFolderDisplay()}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <Button onClick={handleOpenFolder} disabled={!canOpenFolder}>
          打开当前目录
        </Button>
        <Button onClick={handleOpenLatestFile} disabled={!canOpenLatestFile} style={{ marginLeft: '8px' }}>
          打开最新文件
        </Button>
      </div>
      <div>
        <h4 style={{ marginBottom: '8px' }}>待上传文件列表</h4>
        {stagingFiles.length === 0 ? (
          <Empty description="暂无待上传文件" />
        ) : (
          <List
            dataSource={stagingFiles}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Button key="import" onClick={() => handleImportFile(file)}>
                    导入
                  </Button>
                ]}
              >
                <List.Item.Meta
                  title={file.filename}
                  description={`大小: ${(file.size / 1024).toFixed(2)} KB | 修改时间: ${new Date(file.modified_at).toLocaleString()}`}
                />
              </List.Item>
            )}
          />
        )}
      </div>
      <div style={{ margin: '16px 0' }}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0];
            if (selectedFile) {
              handleUploadFile(selectedFile);
            }
          }}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          style={{ marginBottom: '8px' }}
        >
          选择本地文件
        </Button>
      </div>
      <div>
        <h4 style={{ marginBottom: '8px' }}>历史文件记录</h4>
        {error ? (
          <Empty description={`加载历史记录失败: ${error}`} />
        ) : files.length === 0 ? (
          <Empty description="暂无历史记录" />
        ) : (
          <FileList files={files} title="" />
        )}
      </div>
      <div style={{ marginTop: '16px' }}>
        <label style={{ marginBottom: '8px', display: 'block' }}>备注</label>
        <Input.TextArea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="输入备注"
          rows={3}
        />
      </div>
    </Modal>
  );
};

export default DocumentSlotModal;
