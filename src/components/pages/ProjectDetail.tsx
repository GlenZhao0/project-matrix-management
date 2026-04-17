import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { deleteSlot, getProjectMatrix, MatrixSlot } from '../../api/matrix';
import { getSlotTemplateDetail, SlotTemplateItem } from '../../api/slotTemplates';
import Button from '../common/Button';
import DocumentSlotModal from './DocumentSlotModal';
import ProjectSummaryEditor from './ProjectSummaryEditor';

interface ProjectDetailProps {
  project: ProjectResponse;
  parts: ProjectPart[];
  onBack: () => void;
  onRefresh: () => void;
  initialTab?: 'summary' | 'part-list';
  startSummaryInEditMode?: boolean;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  parts,
  onBack,
  onRefresh,
  initialTab = 'summary',
  startSummaryInEditMode = false,
}) => {
  const [uploading, setUploading] = useState(false);
  const [projectSlots, setProjectSlots] = useState<MatrixSlot[]>([]);
  const [slotTemplates, setSlotTemplates] = useState<SlotTemplate[]>([]);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'summary' | 'part-list'>(() => initialTab);
  const [partSearch, setPartSearch] = useState('');
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
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
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
  const panelStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    boxShadow: 'var(--shadow-md)',
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '17px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  };
  const sectionHintStyle: React.CSSProperties = {
    marginTop: '4px',
    color: 'var(--text-secondary)',
    fontSize: '12px',
    lineHeight: 1.5,
  };
  const fieldBlockStyle: React.CSSProperties = {
    padding: '12px 14px',
    border: '1px solid var(--border-strong)',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-card-soft)',
  };
  const fieldLabelStyle: React.CSSProperties = {
    marginBottom: '8px',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  };
  const tabButtonStyle = (active: boolean): React.CSSProperties => ({
    borderColor: active ? 'var(--primary-border)' : 'var(--border-color)',
    backgroundColor: active ? 'var(--primary-soft)' : 'var(--bg-card)',
    color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
    boxShadow: active ? '0 4px 10px color-mix(in srgb, var(--primary-color) 16%, transparent)' : 'none',
  });
  const expandedContentIndent = 30;

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
    setActiveTab((currentTab) => {
      if (currentTab === 'summary' || currentTab === 'part-list') {
        return currentTab;
      }
      return initialTab;
    });
  }, [initialTab]);

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

  const partLevelMap = useMemo(() => {
    const partNoMap = new Map<string, ProjectPart>();
    const levelCache = new Map<string, number>();

    parts.forEach((part) => {
      if (part.part_no) {
        partNoMap.set(part.part_no, part);
      }
    });

    const getLevel = (part: ProjectPart, visited = new Set<string>()): number => {
      if (levelCache.has(part.id)) {
        return levelCache.get(part.id)!;
      }

      if (!part.parent_part_no) {
        levelCache.set(part.id, 0);
        return 0;
      }

      if (visited.has(part.id)) {
        levelCache.set(part.id, 0);
        return 0;
      }

      const parentPart = partNoMap.get(part.parent_part_no);
      if (!parentPart) {
        levelCache.set(part.id, 0);
        return 0;
      }

      visited.add(part.id);
      const level = getLevel(parentPart, visited) + 1;
      levelCache.set(part.id, level);
      return level;
    };

    return new Map(parts.map((part) => [part.id, getLevel(part)]));
  }, [parts]);

  const filteredParts = useMemo(() => {
    const keyword = partSearch.trim().toLowerCase();
    if (!keyword) {
      return parts;
    }

    return parts.filter((part) => {
      const partNo = part.part_no?.toLowerCase() || '';
      const partName = part.part_name?.toLowerCase() || '';
      return partNo.includes(keyword) || partName.includes(keyword);
    });
  }, [partSearch, parts]);

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

  const handleDeleteSlot = (slot: MatrixSlot) => {
    if (slot.has_file || slot.latest_upload_at) {
      message.warning('该槽位下仍有文件，请先清空或移走文件后再删除');
      return;
    }

    Modal.confirm({
      title: '确认删除该槽位？',
      content: '删除后该槽位入口会从当前 Part 下移除。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          setDeletingSlotId(slot.slot_id);
          const result = await deleteSlot(slot.slot_id);
          message.success(result.message);
          setProjectSlots((prev) => prev.filter((item) => item.slot_id !== slot.slot_id));
          if (selectedSlotId === slot.slot_id) {
            setModalVisible(false);
            setSelectedSlotId('');
          }
          await refreshProjectSlots();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '删除槽位失败';
          message.error(errorMsg);
          throw err;
        } finally {
          setDeletingSlotId((current) => (current === slot.slot_id ? null : current));
        }
      },
    });
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
      const createdSlot = await createProjectPartSlot(project.id, createSlotTargetPartId, {
        slot_name: slotName,
        group_type: newSlotForm.group_type,
        sort_order: null,
      });
      setProjectSlots((prev) => {
        const nextSlots = prev.filter((slot) => slot.slot_id !== createdSlot.slot_id);
        nextSlots.push({
          slot_id: createdSlot.slot_id,
          part_id: createdSlot.part_id,
          document_type: createdSlot.document_type,
          group_type: (createdSlot.group_type?.toLowerCase() as 'external' | 'internal') || newSlotForm.group_type,
          has_file: createdSlot.has_file,
          latest_upload_at: createdSlot.latest_upload_at,
        });
        return nextSlots;
      });
      setExpandedRows((prev) => (
        prev.includes(createSlotTargetPartId) ? prev : [...prev, createSlotTargetPartId]
      ));
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
          gap: '10px',
        }}
      >
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 700,
            lineHeight: 1.2,
            alignSelf: 'center',
            backgroundColor: 'var(--bg-card-muted)',
            borderRadius: '7px',
            padding: '4px 7px',
            textAlign: 'center',
          }}
        >
          {label}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'flex-start' }}>
          {groupItems.map((item) => (
            <div
              key={`${groupType}-${item.id}`}
              style={{
                minWidth: '68px',
                minHeight: '28px',
                padding: '5px 7px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-card)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
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
            className="slot-add-button"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '999px',
              color: 'var(--primary-color)',
              fontSize: '16px',
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
    return projectSlots
      .filter((slot) => slot.part_id === partId)
      .sort((a, b) => {
        const groupDiff = a.group_type.localeCompare(b.group_type, 'zh-CN');
        if (groupDiff !== 0) {
          return groupDiff;
        }
        return (a.document_type || '').localeCompare(b.document_type || '', 'zh-CN');
      });
  };

  const expandedRowRender = (record: ProjectPart) => {
    const partSlots = getSlotsForPart(record.id);

    if (partSlots.length === 0) {
      return (
        <div
          style={{
            padding: `7px 10px 7px ${expandedContentIndent}px`,
            backgroundColor: 'var(--bg-card-muted)',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            display: 'grid',
            gap: '5px',
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
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 700,
                    lineHeight: 1,
                    alignSelf: 'center',
                    backgroundColor: 'var(--bg-card-soft)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: '999px',
                    padding: '2px 8px',
                    textAlign: 'center',
                  }}
                >
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => handleOpenCreateSlotModal(record, groupType)}
                    className="slot-add-button"
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '999px',
                      color: 'var(--primary-color)',
                      fontSize: '15px',
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
        .filter((slot) => slot.group_type?.toLowerCase() === groupType)
        .sort((a, b) => (a.document_type || '').localeCompare(b.document_type || '', 'zh-CN'));

      if (groupSlots.length === 0) {
        return (
          <div
            key={groupType}
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 700,
                lineHeight: 1,
                alignSelf: 'center',
                backgroundColor: 'var(--bg-card-soft)',
                border: '1px solid var(--border-strong)',
                borderRadius: '999px',
                padding: '2px 8px',
                textAlign: 'center',
              }}
            >
              {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', lineHeight: '26px' }}>暂无槽位</div>
              <Button
                size="small"
                type="text"
                onClick={() => handleOpenCreateSlotModal(record, groupType)}
                className="slot-add-button"
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  color: 'var(--primary-color)',
                  fontSize: '15px',
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
            gap: '8px',
          }}
        >
          <div
            style={{
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 700,
              lineHeight: 1,
              alignSelf: 'center',
              backgroundColor: 'var(--bg-card-soft)',
              border: '1px solid var(--border-strong)',
              borderRadius: '999px',
              padding: '2px 8px',
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
                    width: '84px',
                    display: 'grid',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      alignItems: 'center',
                      gap: '2px',
                      minHeight: '16px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 3px 0 12px',
                        minWidth: 0,
                      }}
                      title={slot.document_type || '未命名槽位'}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {slot.document_type || '未命名槽位'}
                      </span>
                    </div>
                    <Button
                      size="small"
                      type="text"
                      title="删除槽位"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteSlot(slot);
                      }}
                      loading={deletingSlotId === slot.slot_id}
                      style={{
                        width: '18px',
                        minWidth: '18px',
                        height: '18px',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <DeleteOutlined />
                    </Button>
                  </div>
                  <div
                    style={{
                      minHeight: '26px',
                      padding: '4px 6px',
                      textAlign: 'center',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: slot.has_file ? 'var(--primary-soft)' : 'var(--bg-card)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      boxShadow: 'var(--shadow-sm)',
                      color: slot.latest_upload_at ? 'var(--primary-color)' : 'var(--text-secondary)',
                    }}
                    onClick={() => handleSlotClick(slot.slot_id)}
                    title={slot.document_type || '槽位'}
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
                  width: '30px',
                  display: 'grid',
                  gap: '1px',
                  justifyItems: 'center',
                }}
              >
                <div style={{ minHeight: '16px' }} />
                <Button
                  size="small"
                  type="text"
                  onClick={() => handleOpenCreateSlotModal(record, groupType)}
                  className="slot-add-button"
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '999px',
                    color: 'var(--primary-color)',
                    fontSize: '15px',
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
          padding: `7px 10px 7px ${expandedContentIndent}px`,
          backgroundColor: 'var(--bg-card-muted)',
          border: '1px solid var(--border-strong)',
          borderRadius: '10px',
          display: 'grid',
          gap: '6px',
        }}
      >
        {renderGroupRow('external', '外部')}
        {renderGroupRow('internal', '内部')}
      </div>
    );
  };

  const partListContent = parts.length === 0 ? (
    <div style={{ ...panelStyle, padding: '16px 16px 20px', display: 'grid', gap: '14px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px) auto',
          alignItems: 'center',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={sectionTitleStyle}>Part List</div>
          <div style={{ ...sectionHintStyle, marginTop: 0 }}>
            管理当前项目的 Part、父子关系与槽位入口。
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            justifySelf: 'center',
          }}
        >
          <Input
            value={partSearch}
            onChange={(event) => setPartSearch(event.target.value)}
            placeholder="搜索 Part 名称 / Part No"
            allowClear
          />
          <Button type="default" style={{ whiteSpace: 'nowrap' }}>
            筛选
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
          <Button type="primary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            导入 Excel
          </Button>
          <Button onClick={handleOpenCreatePartModal}>
            手动增加 Part
          </Button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 0 0 10px',
              borderLeft: '1px solid var(--border-color)',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>槽位批量动作</div>
            <Button onClick={handleOpenApplyTemplateModal} disabled={parts.length === 0}>
              从模板创建槽位
            </Button>
          </div>
        </div>
      </div>
      <Empty
        description="该项目还没有导入 Part List"
        style={{ marginTop: '12px' }}
      />
    </div>
  ) : (
    <div style={{ ...panelStyle, padding: '16px 16px 10px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px) auto auto',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={sectionTitleStyle}>Part List</div>
          <div style={{ ...sectionHintStyle, marginTop: 0 }}>
            管理当前项目的 Part、父子关系与槽位入口。
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
            justifySelf: 'center',
          }}
        >
          <Input
            value={partSearch}
            onChange={(event) => setPartSearch(event.target.value)}
            placeholder="搜索 Part 名称 / Part No"
            allowClear
          />
          <Button type="default" style={{ whiteSpace: 'nowrap' }}>
            筛选
          </Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifySelf: 'center' }}>
          <Button type="primary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            导入 Excel
          </Button>
          <Button onClick={handleOpenCreatePartModal}>
            手动增加 Part
          </Button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '0 0 0 10px',
              borderLeft: '1px solid var(--border-color)',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>槽位批量动作</div>
            <Button onClick={handleOpenApplyTemplateModal} disabled={parts.length === 0}>
              从模板创建槽位
            </Button>
          </div>
        </div>
        <div
          style={{
            padding: '6px 10px',
            borderRadius: '999px',
            backgroundColor: 'var(--bg-card-muted)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          共 {parts.length} 个 Part
        </div>
      </div>
      <Table
        dataSource={filteredParts.map((part) => ({ ...part, key: part.id }))}
        pagination={false}
        expandable={{
          expandedRowRender,
          expandedRowKeys: expandedRows,
          onExpand: (_expanded, record) => handleExpand(record.id),
          showExpandColumn: false,
        }}
        className="part-list-table"
        columns={[
          {
            title: 'Part No',
            dataIndex: 'part_no',
            key: 'part_no',
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (value: string | undefined, record: ProjectPart) => {
              const level = partLevelMap.get(record.id) || 0;
              const expanded = expandedRows.includes(record.id);
              const arrowColor =
                level === 0
                  ? 'color-mix(in srgb, var(--text-muted) 95%, transparent)'
                  : level === 1
                    ? 'color-mix(in srgb, var(--text-muted) 78%, transparent)'
                    : 'color-mix(in srgb, var(--text-muted) 62%, transparent)';

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    paddingLeft: `${level * 16}px`,
                  }}
                >
                  <Button
                    size="small"
                    type="text"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation();
                      handleExpand(record.id);
                    }}
                    style={{ minWidth: '24px', width: '24px', padding: 0, justifyContent: 'center' }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '8px',
                        borderRight: `1.5px solid ${arrowColor}`,
                        borderBottom: `1.5px solid ${arrowColor}`,
                        transform: expanded ? 'rotate(45deg)' : 'rotate(-45deg)',
                        transformOrigin: 'center',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </Button>
                  <span
                    style={{
                      color: level > 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {value || '-'}
                  </span>
                </div>
              );
            },
          },
          {
            title: 'Part Name',
            dataIndex: 'part_name',
            key: 'part_name',
            align: 'center' as const,
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (value: string | undefined) => <span style={{ color: 'var(--text-primary)' }}>{value || '-'}</span>,
          },
          {
            title: 'Part Type',
            dataIndex: 'part_type',
            key: 'part_type',
            align: 'center' as const,
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (value: string | undefined) => <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>,
          },
          {
            title: 'Parent Part No',
            dataIndex: 'parent_part_no',
            key: 'parent_part_no',
            align: 'center' as const,
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (value: string | undefined) => <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>,
          },
          {
            title: 'Remark',
            dataIndex: 'remark',
            key: 'remark',
            align: 'center' as const,
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (value: string | undefined) => <span style={{ color: 'var(--text-secondary)' }}>{value || '-'}</span>,
          },
          {
            title: '操作',
            key: 'actions',
            align: 'center' as const,
            onHeaderCell: () => ({ style: { textAlign: 'center' } }),
            render: (_value: unknown, record: ProjectPart) => (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Button
                  size="small"
                  type="text"
                  onClick={() => handleOpenEditPartModal(record)}
                  style={{ minWidth: '28px', padding: '0 4px', color: 'var(--text-secondary)' }}
                >
                  <EditOutlined />
                </Button>
                <Button
                  size="small"
                  type="text"
                  onClick={() => handleOpenDeletePartModal(record)}
                  style={{ minWidth: '28px', padding: '0 4px', color: 'var(--danger-color)' }}
                >
                  <DeleteOutlined />
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch' }}>
      <div
        style={{
          ...panelStyle,
          padding: '12px 14px',
          display: 'grid',
          gap: '8px',
          background: 'linear-gradient(180deg, var(--bg-card) 0%, var(--bg-card-soft) 100%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, lineHeight: 1 }}>
            {project.customer_name}
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, lineHeight: 1.1 }}>
            {project.project_name}
          </h1>
        </div>
      </div>
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
      <div style={{ ...panelStyle, padding: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            paddingBottom: '12px',
            marginBottom: '12px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <Button
            type="default"
            onClick={() => setActiveTab('summary')}
            style={tabButtonStyle(activeTab === 'summary')}
          >
            Project Summary
          </Button>
          <Button
            type="default"
            onClick={() => setActiveTab('part-list')}
            style={tabButtonStyle(activeTab === 'part-list')}
          >
            Part List
          </Button>
          <Button
            type="default"
            onClick={() => void onBack()}
          >
            返回
          </Button>
        </div>

        {activeTab === 'summary' ? (
          <ProjectSummaryEditor project={project} onSaved={onRefresh} startInEditMode={startSummaryInEditMode} />
        ) : (
          partListContent
        )}
      </div>
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
        <div
          style={{
            padding: '12px 14px',
            border: '1px solid var(--border-strong)',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-card-muted)',
          }}
        >
          <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>选择模板</div>
          <div style={{ marginBottom: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
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
        </div>
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
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part No</div>
            <Input
              value={newPartForm.part_no}
              onChange={(e) => handleCreatePartFieldChange('part_no', e.target.value)}
              placeholder="输入 Part No"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part Name</div>
            <Input
              value={newPartForm.part_name}
              onChange={(e) => handleCreatePartFieldChange('part_name', e.target.value)}
              placeholder="输入 Part Name"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part Type</div>
            <Input
              value={newPartForm.part_type}
              onChange={(e) => handleCreatePartFieldChange('part_type', e.target.value)}
              placeholder="输入 Part Type"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>选择模板</div>
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
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{descriptionSummary}</div>
                    </div>
                  </Select.Option>
                );
              })}
            </Select>
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Parent Part No</div>
            <Input
              value={newPartForm.parent_part_no}
              onChange={(e) => handleCreatePartFieldChange('parent_part_no', e.target.value)}
              placeholder="可选，输入父件 Part No"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Remark</div>
            <Input.TextArea
              value={newPartForm.remark}
              onChange={(e) => handleCreatePartFieldChange('remark', e.target.value)}
              placeholder="可选，输入备注"
              rows={3}
            />
          </div>
          <div style={{ ...fieldBlockStyle, backgroundColor: 'var(--bg-card-muted)' }}>
            <div style={{ ...fieldLabelStyle, marginBottom: '10px' }}>槽位预览</div>
            {createPartTemplateLoading ? (
              <Spin size="small" tip="模板预览加载中..." />
            ) : (
              <div
                style={{
                  padding: '10px 12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card)',
                  display: 'grid',
                  gap: '10px',
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
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>分组</div>
            <Input
              value={newSlotForm.group_type === 'external' ? '外部' : '内部'}
              readOnly
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>槽位名称</div>
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
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part No</div>
            <Input value={editingPartRecord?.part_no || ''} disabled />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part Name</div>
            <Input value={editingPartRecord?.part_name || ''} disabled />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Part Type</div>
            <Input
              value={editPartForm.part_type || ''}
              onChange={(e) => handleEditPartFieldChange('part_type', e.target.value)}
              placeholder="可选，输入 Part Type"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Parent Part No</div>
            <Input
              value={editPartForm.parent_part_no || ''}
              onChange={(e) => handleEditPartFieldChange('parent_part_no', e.target.value)}
              placeholder="可选，可清空父件"
            />
          </div>
          <div style={fieldBlockStyle}>
            <div style={fieldLabelStyle}>Remark</div>
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
            <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>
              确认要删除该 Part 吗？
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr',
                gap: '10px 12px',
                padding: '12px 14px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              <div style={{ color: 'var(--text-muted)' }}>Part Name</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.part_name || deletePartRecord?.part_name || '-'}</div>
              <div style={{ color: 'var(--text-muted)' }}>Part No</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.part_no || deletePartRecord?.part_no || '-'}</div>
              <div style={{ color: 'var(--text-muted)' }}>文件总数</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.file_count ?? 0}</div>
              <div style={{ color: 'var(--text-muted)' }}>子 Part 数量</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.child_part_count ?? 0}</div>
              <div style={{ color: 'var(--text-muted)' }}>目录状态</div>
              <div style={{ fontWeight: 600 }}>{deletePartInfo?.folder_exists ? '目录存在' : '目录不存在'}</div>
            </div>

            <div
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: deletePartInfo && deletePartInfo.child_part_count > 0 ? 'var(--danger-soft)' : 'var(--warning-soft)',
                border: `1px solid ${
                  deletePartInfo && deletePartInfo.child_part_count > 0 ? 'var(--danger-border)' : 'var(--warning-border)'
                }`,
                color: deletePartInfo && deletePartInfo.child_part_count > 0 ? 'var(--danger-color)' : 'var(--warning-text)',
                fontSize: '12px',
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
                padding: '10px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
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
