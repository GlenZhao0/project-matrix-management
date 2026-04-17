import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Input, Spin, Empty, message, List, Modal as AntdModal } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import Button from '../common/Button';
import {
  deleteStagingFile,
  getSlotFiles,
  FileRecord,
  getSlotDetail,
  SlotDetail,
  openFolder,
  getStagingFiles,
  StagingFile,
  importFromStaging,
  ImportFromStagingRequest,
  openLatestFile,
  uploadFile,
} from '../../api/matrix';

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
};

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

  const refreshModalData = async () => {
    const [filesList, detail, staging] = await Promise.all([
      getSlotFiles(slotId),
      getSlotDetail(slotId),
      getStagingFiles(),
    ]);
    setFiles(filesList);
    setSlotDetail(detail);
    setStagingFiles(staging);
  };

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aTime = new Date((a as any).uploaded_at ?? (a as any).uploadDate ?? 0).getTime();
      const bTime = new Date((b as any).uploaded_at ?? (b as any).uploadDate ?? 0).getTime();
      return bTime - aTime;
    });
  }, [files]);

  useEffect(() => {
    if (!visible || !slotId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        await refreshModalData();
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

  const showRemarkInputModal = (callback: (remark: string) => void) => {
    let inputValue = '';
    AntdModal.confirm({
      title: '输入文件备注',
      content: (
        <Input
          placeholder="请输入备注信息"
          onChange={(e) => { inputValue = e.target.value; }}
        />
      ),
      okText: '确认',
      cancelText: '取消',
      onOk() {
        if (!inputValue.trim()) {
          message.error('备注不能为空');
          return Promise.reject();
        }
        callback(inputValue);
      },
    });
  };

  const handleImportFile = async (stagingFile: StagingFile) => {
    if (!remarks.trim()) {
      showRemarkInputModal((remark) => {
        handleImportFileWithRemark(stagingFile, remark);
      });
      return;
    }
    handleImportFileWithRemark(stagingFile, remarks);
  };

  const handleImportFileWithRemark = async (stagingFile: StagingFile, remark: string) => {
    try {
      const request: ImportFromStagingRequest = {
        staging_file_path: stagingFile.full_path,
        remark: remark || undefined,
      };
      await importFromStaging(slotId, request);
      message.success('文件导入成功');

      await refreshModalData();
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

    if (!remarks.trim()) {
      showRemarkInputModal((remark) => {
        handleUploadFileWithRemark(file, remark);
      });
      return;
    }
    handleUploadFileWithRemark(file, remarks);
  };

  const handleUploadFileWithRemark = async (file: File, remark: string) => {
    try {
      await uploadFile(slotId, file, remark || undefined);
      message.success('文件上传成功');

      await refreshModalData();
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

  const handleDeleteStagingFile = (file: StagingFile) => {
    AntdModal.confirm({
      className: 'staging-file-delete-confirm',
      title: '确认删除文件',
      content: '文件会从文件夹删除，是否继续？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          await deleteStagingFile(file.filename);
          message.success('文件删除成功');
          const staging = await getStagingFiles();
          setStagingFiles(staging);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '删除文件失败';
          message.error(errorMsg);
          throw err;
        }
      },
    });
  };

  if (loading) {
    return (
      <AntdModal
        title={title}
        open={visible}
        onCancel={onClose}
        footer={null}
        width={960}
        className="document-slot-modal"
        styles={{ body: { height: '76vh', overflow: 'hidden' } }}
      >
        <Spin size="large" tip="加载中..." />
      </AntdModal>
    );
  }

  return (
    <AntdModal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={1040}
      className="document-slot-modal"
      styles={{ body: { height: '76vh', overflow: 'hidden' } }}
    >
      <div className="document-slot-modal__content">
        <div
          className="document-slot-modal__topbar"
        >
          <div className="document-slot-modal__path">
            <div className="document-slot-modal__label">目标目录路径</div>
            <div className="document-slot-modal__path-value">
              {getTargetFolderDisplay()}
            </div>
          </div>
          <div className="document-slot-modal__actions">
            <Button onClick={handleOpenFolder} disabled={!canOpenFolder}>
              打开当前目录
            </Button>
            <Button onClick={handleOpenLatestFile} disabled={!canOpenLatestFile}>
              打开最新文件
            </Button>
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
            <Button onClick={() => fileInputRef.current?.click()}>
              选择本地文件
            </Button>
          </div>
        </div>

        <div className="document-slot-modal__body">
          <div className="document-slot-modal__staging">
            <h4 className="document-slot-modal__section-title">待上传文件列表</h4>
            <div className="document-slot-modal__scroll">
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
                        </Button>,
                        <Button
                          key="delete"
                          size="small"
                          type="text"
                          onClick={() => handleDeleteStagingFile(file)}
                          style={{ minWidth: '28px', padding: '0 4px', color: 'var(--danger-color)' }}
                        >
                          <DeleteOutlined />
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={file.filename}
                        description={`大小: ${(file.size / 1024).toFixed(2)} KB | 修改时间: ${formatDateTime(file.modified_at)}`}
                      />
                    </List.Item>
                  )}
                />
              )}
            </div>
          </div>

          <div className="document-slot-modal__side">
            <div className="document-slot-modal__panel document-slot-modal__panel--remark">
              <div className="document-slot-modal__section-title">备注</div>
              <Input.TextArea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="输入备注"
                rows={4}
                className="document-slot-modal__remark-input"
              />
            </div>

            <div className="document-slot-modal__panel document-slot-modal__panel--history">
              <div className="document-slot-modal__section-title">文件上传历史</div>
              <div className="document-slot-modal__scroll">
                {error ? (
                  <Empty description={`加载历史记录失败: ${error}`} />
                ) : sortedFiles.length === 0 ? (
                  <Empty description="暂无历史记录" />
                ) : (
                  <List
                    size="small"
                    dataSource={sortedFiles}
                    renderItem={(file) => {
                      const uploadDate = file.uploaded_at;
                      const remarkText = file.remark;
                      const secondary = [
                        uploadDate ? formatDateTime(uploadDate) : '',
                        remarkText || '',
                        file.is_latest ? '最新版本' : '',
                      ]
                        .filter(Boolean)
                        .join('  ·  ');

                      return (
                        <List.Item>
                          <div style={{ display: 'grid', gap: '3px', minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {file.filename || ''}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                              {secondary || '无备注'}
                            </div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AntdModal>
  );
};

export default DocumentSlotModal;
