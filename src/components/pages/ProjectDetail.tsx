import React, { useState, useRef, useEffect } from 'react';
import { Input, Spin, Table, Empty, Modal, Select, message } from 'antd';
import { DeleteOutlined, EditOutlined, ExportOutlined, FolderOpenOutlined } from '@ant-design/icons';
import {
  createProjectPartSlot,
  createProjectPart,
  CreateProjectPartSlotInput,
  CreateProjectPartInput,
  deleteProjectPart,
  getProjectPartDeleteInfo,
  moveProjectPartFilesToStaging,
  openProjectPartFolder,
  ProjectResponse,
  ProjectPart,
  ProjectPartDeleteInfo,
  SlotTemplate,
  updateProjectPart,
  UpdateProjectPartInput,
  applyTemplateToProject,
  getSlotTemplates,
  importProjectPartsExcel,
} from '../../api/projects';
import { getProjectMatrix, MatrixSlot } from '../../api/matrix';
import { getSlotTemplateDetail, SlotTemplateItem } from '../../api/slotTemplates';
import Button from '../common/Button';
import DocumentSlotModal from './DocumentSlotModal';

interface ProjectDetailProps {
  project: ProjectResponse;
  parts: ProjectPart[];
  onBack: () => void;
  onRefresh: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({ project, parts, onBack, onRefresh }) => {
  const [uploading, setUploading] = useState(false);
  const [projectSlots, setProjectSlots] = useState<MatrixSlot[]>([]);
  const [slotTemplates, setSlotTemplates] = useState<SlotTemplate[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [applyTemplateModalVisible, setApplyTemplateModalVisible] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [createPartModalVisible, setCreatePartModalVisible] = useState(false);
  const [creatingPart, setCreatingPart] = useState(false);
  const [editPartModalVisible, setEditPartModalVisible] = useState(false);
  const [editingPart, setEditingPart] = useState(false);
  const [editingPartRecord, setEditingPartRecord] = useState<ProjectPart | null>(null);
  const [editPartForm, setEditPartForm] = useState<UpdateProjectPartInput>({
    part_type: '',
    parent_part_no: '',
    remark: '',
  });
  const [createSlotModalVisible, setCreateSlotModalVisible] = useState(false);
  const [creatingSlot, setCreatingSlot] = useState(false);
  const [deletePartModalVisible, setDeletePartModalVisible] = useState(false);
  const [deletingPart, setDeletingPart] = useState(false);
  const [deleteInfoLoading, setDeleteInfoLoading] = useState(false);
  const [deletePartRecord, setDeletePartRecord] = useState<ProjectPart | null>(null);
  const [deletePartInfo, setDeletePartInfo] = useState<ProjectPartDeleteInfo | null>(null);
  const [movingPartFiles, setMovingPartFiles] = useState(false);
  const [openingPartFolder, setOpeningPartFolder] = useState(false);
  const [newSlotForm, setNewSlotForm] = useState<CreateProjectPartSlotInput>({
    slot_name: '',
    group_type: 'external',
    sort_order: null,
  });
  const [createSlotTargetPartId, setCreateSlotTargetPartId] = useState<string>('');
  const [createSlotTargetPartName, setCreateSlotTargetPartName] = useState<string>('');
  const [createPartTemplateId, setCreatePartTemplateId] = useState<string | undefined>(undefined);
  const [createPartTemplatePreview, setCreatePartTemplatePreview] = useState<SlotTemplateItem[]>([]);
  const [createPartTemplateLoading, setCreatePartTemplateLoading] = useState(false);
  const [newPartForm, setNewPartForm] = useState<CreateProjectPartInput>({
    part_no: '',
    part_name: '',
    part_type: '',
    parent_part_no: '',
    remark: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const createPartTemplateRequestRef = useRef(0);

  const refreshProjectSlots = async () => {
    try {
      const matrix = await getProjectMatrix(project.id);
      setProjectSlots(matrix.slots);
    } catch (err) {
      console.error('获取项目槽位失败:', err);
    }
  };

  useEffect(() => {
    if (project.id) {
      refreshProjectSlots();
    }
  }, [project.id]);

  useEffect(() => {
    const fetchSlotTemplates = async () => {
      try {
        const templates = await getSlotTemplates();
        setSlotTemplates(templates);
      } catch (err) {
        console.error('获取槽位模板列表失败:', err);
      }
    };

    fetchSlotTemplates();
  }, []);

  const handleImportExcel = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    setUploading(true);
    try {
      await importProjectPartsExcel(project.id, formData);
      message.success('Excel 导入成功');
      await onRefresh();
      await refreshProjectSlots();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '导入失败';
      message.error(errorMsg);
      console.error('导入 Excel 出错:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExpand = (partId: string) => {
    setExpandedRows(prev =>
      prev.includes(partId)
        ? prev.filter(id => id !== partId)
        : [...prev, partId]
    );
  };

  const handleSlotClick = (slotId: string) => {
    setSelectedSlotId(slotId);
    setModalVisible(true);
  };

  const handleAddSlotPlaceholder = (groupLabel: string) => {
    message.info(`${groupLabel}槽位新增功能待实现`);
  };

  const resetCreateSlotForm = () => {
    setNewSlotForm({
      slot_name: '',
      group_type: 'external',
      sort_order: null,
    });
    setCreateSlotTargetPartId('');
    setCreateSlotTargetPartName('');
  };

  const handleOpenCreateSlotModal = (part: ProjectPart, groupType: 'external' | 'internal') => {
    setCreateSlotTargetPartId(part.id);
    setCreateSlotTargetPartName(part.part_no || part.part_name);
    setNewSlotForm({
      slot_name: '',
      group_type: groupType,
      sort_order: null,
    });
    setCreateSlotModalVisible(true);
  };

  const handleCreateSlotFieldChange = (field: keyof CreateProjectPartSlotInput, value: string) => {
    setNewSlotForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateSlot = async () => {
    const slotName = newSlotForm.slot_name.trim();
    if (!slotName) {
      message.warning('请输入槽位名称');
      return;
    }
    if (!createSlotTargetPartId) {
      message.error('未找到当前 Part');
      return;
    }

    try {
      setCreatingSlot(true);
      await createProjectPartSlot(project.id, createSlotTargetPartId, {
        slot_name: slotName,
        group_type: newSlotForm.group_type,
        sort_order: null,
      });
      message.success('槽位创建成功');
      setCreateSlotModalVisible(false);
      resetCreateSlotForm();
      await refreshProjectSlots();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建槽位失败';
      message.error(errorMsg);
      console.error('创建槽位出错:', err);
    } finally {
      setCreatingSlot(false);
    }
  };

  const resetNewPartForm = () => {
    setNewPartForm({
      part_no: '',
      part_name: '',
      part_type: '',
      parent_part_no: '',
      remark: '',
    });
    setCreatePartTemplateId(undefined);
    setCreatePartTemplatePreview([]);
    setCreatePartTemplateLoading(false);
    createPartTemplateRequestRef.current += 1;
  };

  const handleOpenApplyTemplateModal = () => {
    if (parts.length === 0) {
      message.warning('请先导入 Part List');
      return;
    }
    setSelectedTemplateId(undefined);
    setApplyTemplateModalVisible(true);
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) {
      message.warning('请选择一个模板');
      return;
    }

    try {
      setApplyingTemplate(true);
      const result = await applyTemplateToProject(project.id, selectedTemplateId);
      message.success(`已创建 ${result.created_count} 个，跳过 ${result.skipped_count} 个，涉及 ${result.part_count} 个 Part`);
      setApplyTemplateModalVisible(false);
      setSelectedTemplateId(undefined);
      await onRefresh();
      await refreshProjectSlots();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '从模板创建槽位失败';
      message.error(errorMsg);
      console.error('从模板创建槽位出错:', err);
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleOpenCreatePartModal = () => {
    resetNewPartForm();
    setCreatePartModalVisible(true);
  };

  const handleCreatePartFieldChange = (field: keyof CreateProjectPartInput, value: string) => {
    setNewPartForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetEditPartForm = () => {
    setEditingPartRecord(null);
    setEditPartForm({
      part_type: '',
      parent_part_no: '',
      remark: '',
    });
  };

  const handleOpenEditPartModal = (part: ProjectPart) => {
    setEditingPartRecord(part);
    setEditPartForm({
      part_type: part.part_type || '',
      parent_part_no: part.parent_part_no || '',
      remark: part.remark || '',
    });
    setEditPartModalVisible(true);
  };

  const handleEditPartFieldChange = (field: keyof UpdateProjectPartInput, value: string) => {
    setEditPartForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUpdatePart = async () => {
    if (!editingPartRecord) {
      message.error('未找到当前 Part');
      return;
    }

    try {
      setEditingPart(true);
      await updateProjectPart(project.id, editingPartRecord.id, {
        part_type: editPartForm.part_type?.trim() || undefined,
        parent_part_no: editPartForm.parent_part_no?.trim() ? editPartForm.parent_part_no.trim() : null,
        remark: editPartForm.remark?.trim() ? editPartForm.remark.trim() : null,
      });
      message.success('Part 更新成功');
      setEditPartModalVisible(false);
      resetEditPartForm();
      await onRefresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '更新 Part 失败';
      message.error(errorMsg);
      console.error('更新 Part 出错:', err);
    } finally {
      setEditingPart(false);
    }
  };

  const refreshDeletePartInfo = async (partId: string) => {
    const info = await getProjectPartDeleteInfo(project.id, partId);
    setDeletePartInfo(info);
    return info;
  };

  const resetDeletePartState = () => {
    setDeletePartRecord(null);
    setDeletePartInfo(null);
  };

  const handleOpenDeletePartModal = async (part: ProjectPart) => {
    try {
      setDeleteInfoLoading(true);
      setDeletePartRecord(part);
      setDeletePartInfo(null);
      setDeletePartModalVisible(true);
      await refreshDeletePartInfo(part.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取删除信息失败';
      message.error(errorMsg);
      setDeletePartModalVisible(false);
      resetDeletePartState();
    } finally {
      setDeleteInfoLoading(false);
    }
  };

  const handleMoveCurrentPartFilesToStaging = async () => {
    if (!deletePartRecord) {
      return;
    }

    try {
      setMovingPartFiles(true);
      const result = await moveProjectPartFilesToStaging(project.id, deletePartRecord.id);
      message.success(`已移动 ${result.moved_count} 个文件到待上传文件夹`);
      await refreshDeletePartInfo(deletePartRecord.id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '移动文件失败';
      message.error(errorMsg);
    } finally {
      setMovingPartFiles(false);
    }
  };

  const handleOpenCurrentPartFolder = async () => {
    if (!deletePartRecord) {
      return;
    }

    try {
      setOpeningPartFolder(true);
      await openProjectPartFolder(project.id, deletePartRecord.id);
      message.success('目录已打开');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '打开目录失败';
      message.error(errorMsg);
    } finally {
      setOpeningPartFolder(false);
    }
  };

  const handleDeletePart = async () => {
    if (!deletePartRecord) {
      return;
    }
    if (deleteInfoLoading) {
      message.error('删除信息加载中，请稍后再试');
      return;
    }
    if (!deletePartInfo) {
      message.error('未获取到删除信息');
      return;
    }
    if (deletePartInfo.child_part_count > 0) {
      message.error('该 Part 下仍有子 Part，当前阶段不允许删除');
      return;
    }
    if (deletePartInfo.file_count > 0) {
      message.error('该 Part 下仍有文件，当前阶段不允许删除');
      return;
    }

    try {
      setDeletingPart(true);
      await deleteProjectPart(project.id, deletePartRecord.id);
      message.success('Part 删除成功');
      setDeletePartModalVisible(false);
      setExpandedRows((prev) => prev.filter((id) => id !== deletePartRecord.id));
      resetDeletePartState();
      await onRefresh();
      await refreshProjectSlots();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '删除 Part 失败';
      message.error(errorMsg);
    } finally {
      setDeletingPart(false);
    }
  };

  const handleCreatePartTemplateChange = async (templateId?: string) => {
    createPartTemplateRequestRef.current += 1;
    const requestId = createPartTemplateRequestRef.current;
    setCreatePartTemplateId(templateId);
    setCreatePartTemplatePreview([]);

    if (!templateId) {
      setCreatePartTemplateLoading(false);
      return;
    }

    try {
      setCreatePartTemplateLoading(true);
      const detail = await getSlotTemplateDetail(templateId);
      if (requestId !== createPartTemplateRequestRef.current) {
        return;
      }
      setCreatePartTemplatePreview(detail.items);
      if (detail.items.length === 0) {
        message.warning('所选模板没有可创建的槽位项');
      }
    } catch (err) {
      if (requestId !== createPartTemplateRequestRef.current) {
        return;
      }
      const errorMsg = err instanceof Error ? err.message : '获取模板预览失败';
      message.error(errorMsg);
      setCreatePartTemplatePreview([]);
    } finally {
      if (requestId === createPartTemplateRequestRef.current) {
        setCreatePartTemplateLoading(false);
      }
    }
  };

  const handleCreatePart = async () => {
    if (!newPartForm.part_no.trim()) {
      message.warning('请输入 Part No');
      return;
    }
    if (!newPartForm.part_name.trim()) {
      message.warning('请输入 Part Name');
      return;
    }
    if (createPartTemplateLoading) {
      message.warning('模板预览加载中，请稍后再试');
      return;
    }
    if (createPartTemplateId && createPartTemplatePreview.length === 0) {
      message.warning('所选模板没有可创建的槽位项');
      return;
    }

    try {
      setCreatingPart(true);
      await createProjectPart(project.id, {
        part_no: newPartForm.part_no.trim(),
        part_name: newPartForm.part_name.trim(),
        part_type: newPartForm.part_type?.trim() || undefined,
        parent_part_no: newPartForm.parent_part_no?.trim() || undefined,
        remark: newPartForm.remark?.trim() || undefined,
        slot_template_id: createPartTemplateId ?? null,
      });
      message.success('Part 创建成功');
      setCreatePartModalVisible(false);
      resetNewPartForm();
      await onRefresh();
      await refreshProjectSlots();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '创建 Part 失败';
      message.error(errorMsg);
      console.error('创建 Part 出错:', err);
    } finally {
      setCreatingPart(false);
    }
  };

  const renderCreatePartPreviewGroup = (groupType: 'external' | 'internal', label: string) => {
    const groupItems = createPartTemplatePreview
      .filter((item) => item.group_type === groupType)
      .sort((a, b) => a.sort_order - b.sort_order || a.slot_name.localeCompare(b.slot_name, 'zh-CN'));

    return (
      <div
        key={groupType}
        style={{
          display: 'grid',
          gridTemplateColumns: '48px 1fr',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            color: '#374151',
            fontSize: '13px',
            fontWeight: 700,
            lineHeight: 1.2,
            alignSelf: 'center',
            backgroundColor: '#e5e7eb',
            borderRadius: '6px',
            padding: '4px 8px',
            textAlign: 'center',
          }}
        >
          {label}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
          {groupItems.map((item) => (
            <div
              key={`${groupType}-${item.id}`}
              style={{
                minWidth: '72px',
                minHeight: '30px',
                padding: '6px 8px',
                border: '1px solid #d9d9d9',
                borderRadius: '5px',
                backgroundColor: '#ffffff',
                fontSize: '12px',
                color: '#374151',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.slot_name}
            </div>
          ))}
          <Button
            size="small"
            type="text"
            onClick={() => handleAddSlotPlaceholder(label)}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '999px',
              backgroundColor: 'rgba(59, 130, 246, 0.10)',
              color: '#2563eb',
              fontSize: '18px',
              padding: 0,
            }}
          >
            +
          </Button>
        </div>
      </div>
    );
  };

  const getSlotsForPart = (partId: string) => {
    return projectSlots.filter(slot => slot.part_id === partId);
  };

  const expandedRowRender = (record: ProjectPart) => {
    const partSlots = getSlotsForPart(record.id);

    if (partSlots.length === 0) {
      return (
        <div
          style={{
            padding: '8px 16px 8px 48px',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px',
            display: 'grid',
            gap: '8px',
          }}
        >
          {(['external', 'internal'] as const).map((groupType) => {
            const label = groupType === 'external' ? '外部' : '内部';

            return (
              <div
                key={groupType}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    color: '#374151',
                    fontSize: '14px',
                    fontWeight: 700,
                    lineHeight: 1.2,
                    alignSelf: 'center',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    textAlign: 'center',
                  }}
                >
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => handleOpenCreateSlotModal(record, groupType)}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(59, 130, 246, 0.10)',
                      color: '#2563eb',
                      fontSize: '18px',
                      padding: 0,
                    }}
                  >
                    +
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    const renderGroupRow = (groupType: 'external' | 'internal', label: string) => {
      const groupSlots = partSlots
        .filter((slot) => slot.group_type === groupType)
        .sort((a, b) => a.document_type.localeCompare(b.document_type, 'zh-CN'));

      if (groupSlots.length === 0) {
        return (
          <div
            key={groupType}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <div
              style={{
                color: '#374151',
                fontSize: '14px',
                fontWeight: 700,
                lineHeight: 1.2,
                alignSelf: 'center',
                backgroundColor: '#e5e7eb',
                borderRadius: '6px',
                padding: '4px 8px',
                textAlign: 'center',
              }}
            >
              {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ color: '#6b7280', fontSize: '12px', lineHeight: '28px' }}>暂无槽位</div>
              <Button
                size="small"
                type="text"
                onClick={() => handleOpenCreateSlotModal(record, groupType)}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(59, 130, 246, 0.10)',
                  color: '#2563eb',
                  fontSize: '18px',
                  padding: 0,
                }}
              >
                +
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div
          key={groupType}
          style={{
            display: 'grid',
            gridTemplateColumns: '48px 1fr',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              color: '#374151',
              fontSize: '14px',
              fontWeight: 700,
              lineHeight: 1.2,
              alignSelf: 'center',
              backgroundColor: '#e5e7eb',
              borderRadius: '6px',
              padding: '4px 8px',
              textAlign: 'center',
            }}
          >
            {label}
          </div>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'flex-start' }}>
              {groupSlots.map((slot) => (
                <div
                  key={slot.slot_id}
                  style={{
                    width: '75px',
                    display: 'grid',
                    gap: '3px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#000000',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      minHeight: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                    }}
                  >
                    {slot.document_type}
                  </div>
                  <div
                    style={{
                      minHeight: '18px',
                      padding: '4px 4px',
                      textAlign: 'center',
                      border: '1px solid #d9d9d9',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      backgroundColor: slot.has_file ? '#ffffff' : '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: slot.latest_upload_at ? '#2563eb' : '#4b5563',
                    }}
                    onClick={() => handleSlotClick(slot.slot_id)}
                  >
                    <div style={{ lineHeight: 1.25 }}>
                      {slot.latest_upload_at
                        ? new Date(slot.latest_upload_at).toLocaleDateString('zh-CN')
                        : '未上传'
                      }
                    </div>
                  </div>
                </div>
              ))}
              <div
                style={{
                  width: '34px',
                  display: 'grid',
                  gap: '3px',
                  justifyItems: 'center',
                }}
              >
                <div style={{ minHeight: '20px' }} />
                <Button
                  size="small"
                  type="text"
                  onClick={() => handleOpenCreateSlotModal(record, groupType)}
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(59, 130, 246, 0.10)',
                    color: '#2563eb',
                    fontSize: '18px',
                    padding: 0,
                  }}
                >
                  +
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div
        style={{
          padding: '8px 16px 8px 48px',
          backgroundColor: '#f9f9f9',
          borderRadius: '4px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {renderGroupRow('external', '外部')}
        {renderGroupRow('internal', '内部')}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <Button onClick={onBack}>返回</Button>
      </div>
      <h1 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 700 }}>项目详情 - {project.project_name}</h1>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (!file.name.toLowerCase().endsWith('.xlsx')) {
            message.error('请选择 .xlsx 文件');
            return;
          }
          handleImportExcel(file);
        }}
      />
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Button type="primary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            导入 Excel
          </Button>
          <Button onClick={handleOpenApplyTemplateModal} disabled={parts.length === 0}>
            从模板创建槽位
          </Button>
          <Button onClick={handleOpenCreatePartModal}>
            手动增加 Part
          </Button>
        </div>
      </div>
      {parts.length === 0 ? (
        <Empty
          description="该项目还没有导入 Part List"
          style={{ marginTop: '50px' }}
        />
      ) : (
        <Table
          dataSource={parts.map((part) => ({ ...part, key: part.id }))}
          pagination={false}
          expandable={{
            expandedRowRender,
            expandedRowKeys: expandedRows,
            onExpand: (_expanded, record) => handleExpand(record.id),
            expandIcon: ({ expanded, record }) => (
              <Button
                size="small"
                type="text"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  handleExpand(record.id);
                }}
                style={{ marginRight: 8, minWidth: '28px', padding: '0 4px' }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRight: '1.5px solid #9ca3af',
                    borderBottom: '1.5px solid #9ca3af',
                    transform: expanded ? 'rotate(45deg)' : 'rotate(-45deg)',
                    transformOrigin: 'center',
                    transition: 'transform 0.15s ease',
                  }}
                />
              </Button>
            ),
          }}
          columns={[
            { title: 'Part No', dataIndex: 'part_no', key: 'part_no' },
            { title: 'Part Name', dataIndex: 'part_name', key: 'part_name' },
            { title: 'Part Type', dataIndex: 'part_type', key: 'part_type' },
            { title: 'Parent Part No', dataIndex: 'parent_part_no', key: 'parent_part_no' },
            { title: 'Remark', dataIndex: 'remark', key: 'remark' },
            {
              title: '操作',
              key: 'actions',
              render: (_value: unknown, record: ProjectPart) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => handleOpenEditPartModal(record)}
                    style={{ minWidth: '28px', padding: '0 4px', color: '#4b5563' }}
                  >
                    <EditOutlined />
                  </Button>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => handleOpenDeletePartModal(record)}
                    style={{ minWidth: '28px', padding: '0 4px', color: '#ef4444' }}
                  >
                    <DeleteOutlined />
                  </Button>
                </div>
              ),
            },
          ]}
        />
      )}
      <DocumentSlotModal
        slotId={selectedSlotId}
        visible={modalVisible}
        title="文档槽位管理"
        onClose={async () => {
          setModalVisible(false);
          await refreshProjectSlots();
        }}
      />
      <Modal
        title="从模板创建槽位"
        open={applyTemplateModalVisible}
        onCancel={() => {
          if (applyingTemplate) return;
          setApplyTemplateModalVisible(false);
          setSelectedTemplateId(undefined);
        }}
        onOk={handleApplyTemplate}
        okText="确认"
        cancelText="取消"
        confirmLoading={applyingTemplate}
      >
        <div style={{ marginBottom: '8px', color: '#4b5563', fontSize: '14px' }}>
          选择一个模板，将其中的槽位项批量应用到当前项目已有的 Part。
        </div>
        <Select
          value={selectedTemplateId}
          onChange={setSelectedTemplateId}
          placeholder="请选择模板"
          style={{ width: '100%' }}
          options={slotTemplates.map((template) => ({
            label: template.template_name,
            value: template.id,
          }))}
        />
      </Modal>
      <Modal
        title="手动增加 Part"
        open={createPartModalVisible}
        onCancel={() => {
          if (creatingPart) return;
          setCreatePartModalVisible(false);
          resetNewPartForm();
        }}
        onOk={handleCreatePart}
        okText="提交"
        cancelText="取消"
        confirmLoading={creatingPart}
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part No</div>
            <Input
              value={newPartForm.part_no}
              onChange={(e) => handleCreatePartFieldChange('part_no', e.target.value)}
              placeholder="输入 Part No"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part Name</div>
            <Input
              value={newPartForm.part_name}
              onChange={(e) => handleCreatePartFieldChange('part_name', e.target.value)}
              placeholder="输入 Part Name"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part Type</div>
            <Input
              value={newPartForm.part_type}
              onChange={(e) => handleCreatePartFieldChange('part_type', e.target.value)}
              placeholder="输入 Part Type"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>选择模板</div>
            <Select
              value={createPartTemplateId}
              onChange={(value) => handleCreatePartTemplateChange(value)}
              allowClear
              optionLabelProp="label"
              placeholder="可选，选择模板"
              style={{ width: '100%' }}
            >
              {slotTemplates.map((template) => {
                const descriptionSummary = template.description
                  ? (template.description.length > 24
                      ? `${template.description.slice(0, 24)}...`
                      : template.description)
                  : '无描述';

                return (
                  <Select.Option
                    key={template.id}
                    value={template.id}
                    label={template.template_name}
                  >
                    <div style={{ display: 'grid', gap: '2px' }}>
                      <div style={{ fontWeight: 600 }}>{template.template_name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{descriptionSummary}</div>
                    </div>
                  </Select.Option>
                );
              })}
            </Select>
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Parent Part No</div>
            <Input
              value={newPartForm.parent_part_no}
              onChange={(e) => handleCreatePartFieldChange('parent_part_no', e.target.value)}
              placeholder="可选，输入父件 Part No"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Remark</div>
            <Input.TextArea
              value={newPartForm.remark}
              onChange={(e) => handleCreatePartFieldChange('remark', e.target.value)}
              placeholder="可选，输入备注"
              rows={3}
            />
          </div>
          <div>
            <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 600 }}>槽位预览</div>
            {createPartTemplateLoading ? (
              <Spin size="small" tip="模板预览加载中..." />
            ) : (
              <div
                style={{
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#f9fafb',
                  display: 'grid',
                  gap: '12px',
                }}
              >
                {renderCreatePartPreviewGroup('external', '外部')}
                {renderCreatePartPreviewGroup('internal', '内部')}
              </div>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        title={`新增槽位${createSlotTargetPartName ? ` - ${createSlotTargetPartName}` : ''}`}
        open={createSlotModalVisible}
        onCancel={() => {
          if (creatingSlot) return;
          setCreateSlotModalVisible(false);
          resetCreateSlotForm();
        }}
        onOk={handleCreateSlot}
        okText="提交"
        cancelText="取消"
        confirmLoading={creatingSlot}
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>分组</div>
            <Input
              value={newSlotForm.group_type === 'external' ? '外部' : '内部'}
              readOnly
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>槽位名称</div>
            <Input
              value={newSlotForm.slot_name}
              onChange={(e) => handleCreateSlotFieldChange('slot_name', e.target.value)}
              placeholder="输入槽位名称"
            />
          </div>
        </div>
      </Modal>
      <Modal
        title="编辑 Part"
        open={editPartModalVisible}
        onCancel={() => {
          if (editingPart) return;
          setEditPartModalVisible(false);
          resetEditPartForm();
        }}
        onOk={handleUpdatePart}
        okText="保存"
        cancelText="取消"
        confirmLoading={editingPart}
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part No</div>
            <Input value={editingPartRecord?.part_no || ''} disabled />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part Name</div>
            <Input value={editingPartRecord?.part_name || ''} disabled />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Part Type</div>
            <Input
              value={editPartForm.part_type || ''}
              onChange={(e) => handleEditPartFieldChange('part_type', e.target.value)}
              placeholder="可选，输入 Part Type"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Parent Part No</div>
            <Input
              value={editPartForm.parent_part_no || ''}
              onChange={(e) => handleEditPartFieldChange('parent_part_no', e.target.value)}
              placeholder="可选，可清空父件"
            />
          </div>
          <div>
            <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 600 }}>Remark</div>
            <Input.TextArea
              value={editPartForm.remark || ''}
              onChange={(e) => handleEditPartFieldChange('remark', e.target.value)}
              placeholder="可选，输入备注"
              rows={3}
            />
          </div>
        </div>
      </Modal>
      <Modal
        title="删除 Part"
        open={deletePartModalVisible}
        onCancel={() => {
          if (deletingPart || movingPartFiles || openingPartFolder) return;
          setDeletePartModalVisible(false);
          resetDeletePartState();
        }}
        onOk={handleDeletePart}
        okText="确认删除"
        cancelText="取消"
        confirmLoading={deletingPart}
        okButtonProps={{
          danger: true,
          disabled:
            deleteInfoLoading ||
            !deletePartInfo ||
            deletePartInfo.child_part_count > 0 ||
            deletePartInfo.file_count > 0,
        }}
      >
        {deleteInfoLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <Spin size="small" tip="删除信息加载中..." />
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div style={{ color: '#111827', fontSize: '15px', fontWeight: 600 }}>
              确认要删除该 Part 吗？
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '10px 12px',
                padding: '14px 16px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
              }}
            >
              <div style={{ color: '#6b7280' }}>Part Name</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.part_name || deletePartRecord?.part_name || '-'}</div>
              <div style={{ color: '#6b7280' }}>Part No</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.part_no || deletePartRecord?.part_no || '-'}</div>
              <div style={{ color: '#6b7280' }}>文件总数</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.file_count ?? 0}</div>
              <div style={{ color: '#6b7280' }}>子 Part 数量</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.child_part_count ?? 0}</div>
              <div style={{ color: '#6b7280' }}>目录状态</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.folder_exists ? '目录存在' : '目录不存在'}</div>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: deletePartInfo && deletePartInfo.child_part_count > 0 ? '#fff1f2' : '#fff7ed',
                border: `1px solid ${deletePartInfo && deletePartInfo.child_part_count > 0 ? '#fecdd3' : '#fed7aa'}`,
                color: deletePartInfo && deletePartInfo.child_part_count > 0 ? '#be123c' : '#c2410c',
                fontSize: '13px',
                lineHeight: 1.7,
              }}
            >
              {deletePartInfo && deletePartInfo.child_part_count > 0 ? (
                <div>该 Part 下仍有子 Part，当前阶段不允许删除</div>
              ) : (
                <div>
                  <div>删除后整个文件夹会被全部删除</div>
                  <div>删除后无法追回</div>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                flexWrap: 'wrap',
                padding: '12px 14px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#f9fafb',
              }}
            >
              <Button
                size="small"
                onClick={handleMoveCurrentPartFilesToStaging}
                loading={movingPartFiles}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ExportOutlined />
                把该 Part 下面的所有文件放到待上传文件夹
              </Button>
              <Button
                size="small"
                onClick={handleOpenCurrentPartFolder}
                loading={openingPartFolder}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FolderOpenOutlined />
                打开该 Part 的文件夹目录
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProjectDetail;
