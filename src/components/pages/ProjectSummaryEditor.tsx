import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Modal, Select, Spin, message } from 'antd';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { Extension, JSONContent, mergeAttributes, Node } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';

import {
  ProjectPart,
  ProjectResponse,
  ProjectExistingFile,
  ProjectSummaryHistory,
  getProjectExistingFiles,
  getProjectParts,
  getProjectSummaryHistory,
  restoreProjectSummaryHistory,
  updateProjectSummary,
} from '../../api/projects';
import { getProjectMatrix, uploadFile } from '../../api/matrix';
import Button from '../common/Button';
import ProjectSummaryDocument, { createSummaryAttachmentExtension, getAttachmentTypeLabel, hasSummaryContent } from './ProjectSummaryDocument';

interface ProjectSummaryEditorProps {
  project: ProjectResponse;
  onSaved: () => Promise<void> | void;
  startInEditMode?: boolean;
}

interface SelectedImageState {
  pos: number;
  width: number;
}

interface AttachmentSelectionState {
  open: boolean;
  loading: boolean;
  filesLoading: boolean;
  error?: string;
  parts: ProjectPart[];
  slots: AttachmentSelectionSlot[];
  selectedPartId?: string;
  selectedSlotId?: string;
  files: ProjectExistingFile[];
}

interface AttachmentSelectionSlot {
  slotId: string;
  partId: string;
  groupType: 'external' | 'internal';
  slotName: string;
  label: string;
}

type SummaryTextStyle = 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3';

interface ToolbarButtonConfig {
  key: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const emptyEditorHtml = '<p></p>';
const defaultImageWidth = 480;
const minImageWidth = 120;
const maxImageWidth = 960;
const imageWidthInputMin = 80;
const imageWidthInputMax = 1600;
const imageWidthStep = 40;
const defaultTextColor = '#0f172a';
const textColorPalette = ['#0f172a', '#334155', '#1d4ed8', '#dc2626', '#d97706', '#16a34a', '#7c3aed', '#ffffff'] as const;
const fontSizeOptions = [12, 14, 16, 18, 24, 32] as const;
const defaultToolbarState = {
  textStyle: 'paragraph' as SummaryTextStyle,
  textColor: defaultTextColor,
  fontSize: '14',
  bold: false,
  italic: false,
  underline: false,
  bulletList: false,
  orderedList: false,
  alignLeft: true,
  alignCenter: false,
  alignRight: false,
  canSinkListItem: false,
  canLiftListItem: false,
  canUndo: false,
  canRedo: false,
};

const ToolbarIcon: React.FC<{ path: string; viewBox?: string }> = ({ path, viewBox = '0 0 16 16' }) => (
  <svg viewBox={viewBox} aria-hidden="true" focusable="false">
    <path d={path} fill="currentColor" />
  </svg>
);

const toolbarIcons = {
  bold: <span className="project-summary-editor__glyph">B</span>,
  italic: <span className="project-summary-editor__glyph project-summary-editor__glyph--italic">I</span>,
  underline: <span className="project-summary-editor__glyph project-summary-editor__glyph--underline">U</span>,
  bulletList: <ToolbarIcon path="M2 3.5a1 1 0 1 1 0 2a1 1 0 0 1 0-2Zm3 1h9v1H5v-1Zm-3 3a1 1 0 1 1 0 2a1 1 0 0 1 0-2Zm3 1h9v1H5v-1Zm-3 3a1 1 0 1 1 0 2a1 1 0 0 1 0-2Zm3 1h9v1H5v-1Z" />,
  orderedList: <ToolbarIcon path="M1.5 3h1v3h-1V4.8H1V4h.5V3Zm3.5 1.5h9v1H5v-1ZM1 8.2c0-.7.5-1.2 1.3-1.2c.8 0 1.2.5 1.2 1.1c0 .4-.2.8-.7 1.3L1.9 10h1.7v1H1v-.8l1.2-1.1c.4-.3.5-.6.5-.8c0-.3-.2-.5-.5-.5c-.3 0-.5.2-.5.5H1Zm4 0.3h9v1H5v-1Zm-3.7 4.7h1.2c.3 0 .5-.2.5-.5c0-.3-.2-.5-.5-.5H2v-.8h.4c.3 0 .5-.2.5-.4c0-.2-.2-.4-.5-.4c-.3 0-.5.2-.5.4H1c0-.7.5-1.2 1.3-1.2c.8 0 1.3.4 1.3 1c0 .4-.2.7-.5.8c.4.2.7.5.7 1c0 .8-.6 1.2-1.4 1.2H1.3v-1Zm3.7-.2h9v1H5v-1Z" />,
  indent: <ToolbarIcon path="M2 3h12v1H2V3Zm0 3h7v1H2V6Zm0 3h12v1H2V9Zm0 3h7v1H2v-1Zm10.8-6.8l2.7 2.8l-2.7 2.8v-1.8H9.5v-2h3.3V5.2Z" viewBox="0 0 18 16" />,
  outdent: <ToolbarIcon path="M2 3h12v1H2V3Zm5 3h7v1H7V6Zm-5 3h12v1H2V9Zm5 3h7v1H7v-1ZM5.2 5.2V7H8.5v2H5.2v1.8L2.5 8l2.7-2.8Z" viewBox="0 0 18 16" />,
  alignLeft: <ToolbarIcon path="M2 3h12v1H2V3Zm0 3h8v1H2V6Zm0 3h12v1H2V9Zm0 3h8v1H2v-1Z" />,
  alignCenter: <ToolbarIcon path="M2 3h12v1H2V3Zm2 3h8v1H4V6Zm0 3h8v1H4V9ZM2 12h12v1H2v-1Z" />,
  alignRight: <ToolbarIcon path="M2 3h12v1H2V3Zm6 3h6v1H8V6ZM2 9h12v1H2V9Zm6 3h6v1H8v-1Z" />,
  attachment: <ToolbarIcon path="M10.6 4.3a2.5 2.5 0 0 0-3.5 0L3.4 8a3.5 3.5 0 0 0 5 5l4.2-4.2-.7-.7-4.2 4.2a2.5 2.5 0 0 1-3.6-3.5l3.7-3.7a1.5 1.5 0 1 1 2.1 2.1L6.3 11l-.7-.7 3.5-3.5a.5.5 0 0 0-.7-.7L4.9 9.6a1.5 1.5 0 0 0 2.1 2.1l3.5-3.5a2.5 2.5 0 0 0 0-3.5Z" />,
  undo: <ToolbarIcon path="M6.2 4L2 8.1l4.2 4.1V9.4h4.1c1.2 0 2.2 1 2.2 2.2c0 .2 0 .4-.1.7l1 .3c.1-.3.1-.6.1-1c0-1.8-1.4-3.2-3.2-3.2H6.2V4Z" />,
  redo: <ToolbarIcon path="M9.8 4v4.4H5.7c-1.8 0-3.2 1.4-3.2 3.2c0 .3 0 .7.1 1l1-.3c-.1-.3-.1-.5-.1-.7c0-1.2 1-2.2 2.2-2.2h4.1v2.8L14 8.1L9.8 4Z" />,
};

const FontSize = Extension.create({
  name: 'fontSize',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => {
              if (!(element instanceof HTMLElement)) {
                return null;
              }

              return element.style.fontSize || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.fontSize) {
                return {};
              }

              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const TextColor = Extension.create({
  name: 'textColor',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element) => {
              if (!(element instanceof HTMLElement)) {
                return null;
              }

              return element.style.color || null;
            },
            renderHTML: (attributes) => {
              if (!attributes.color) {
                return {};
              }

              return { style: `color: ${attributes.color}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ chain }) =>
          chain().setMark('textStyle', { color }).run(),
      unsetTextColor:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { color: null }).removeEmptyTextStyle().run(),
    };
  },
});

const clampImageWidth = (value: number) => Math.min(maxImageWidth, Math.max(minImageWidth, Math.round(value)));

const normalizeImageWidth = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampImageWidth(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace(/px$/i, '').trim(), 10);
    if (Number.isFinite(parsed)) {
      return clampImageWidth(parsed);
    }
  }

  return defaultImageWidth;
};

const getTextStyleValue = (editor: NonNullable<ReturnType<typeof useEditor>>): SummaryTextStyle => {
  if (editor.isActive('heading', { level: 1 })) {
    return 'heading-1';
  }

  if (editor.isActive('heading', { level: 2 })) {
    return 'heading-2';
  }

  if (editor.isActive('heading', { level: 3 })) {
    return 'heading-3';
  }

  return 'paragraph';
};

const normalizeFontSizeValue = (fontSize: string | null | undefined) => {
  if (!fontSize) {
    return '14';
  }

  const parsed = Number.parseInt(fontSize.replace(/px$/i, '').trim(), 10);
  if (!Number.isFinite(parsed)) {
    return '14';
  }

  return String(parsed);
};

const normalizeColorValue = (color: string | null | undefined) => {
  const themeDefaultColor =
    typeof document === 'undefined'
      ? defaultTextColor
      : getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || defaultTextColor;

  if (!color) {
    return themeDefaultColor;
  }

  if (typeof document === 'undefined') {
    return color;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return color;
  }

  context.fillStyle = themeDefaultColor;
  context.fillStyle = color;
  return context.fillStyle;
};

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

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('无法读取图片数据'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });

const SummaryImage = Node.create({
  name: 'summaryImage',
  group: 'block',
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: defaultImageWidth,
        parseHTML: (element) => {
          if (!(element instanceof HTMLElement)) {
            return defaultImageWidth;
          }

          return normalizeImageWidth(
            element.getAttribute('data-width') || element.style.width || element.getAttribute('width'),
          );
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { width, ...restAttributes } = HTMLAttributes;
    const normalizedWidth = normalizeImageWidth(width);

    return [
      'img',
      mergeAttributes(restAttributes, {
        'data-width': String(normalizedWidth),
        style: `width: ${normalizedWidth}px; max-width: 100%; height: auto; display: block;`,
      }),
    ];
  },
});

const getSummaryContent = (source: { summary_json?: JSONContent | null; legacy_summary_html?: string | null }) => {
  if (source.summary_json) {
    return source.summary_json;
  }

  if (source.legacy_summary_html?.trim()) {
    return source.legacy_summary_html.trim();
  }

  return emptyEditorHtml;
};

const getReadableAttachmentError = (err: unknown, fallback: string) => {
  const errorMsg = err instanceof Error ? err.message : fallback;
  const normalized = errorMsg.toLowerCase();
  if (normalized.includes('failed to fetch') || normalized.includes('load failed') || normalized.includes('networkerror')) {
    return '无法加载项目文件，请检查后端服务连接';
  }
  return errorMsg || fallback;
};

const ProjectSummaryEditor: React.FC<ProjectSummaryEditorProps> = ({ project, onSaved, startInEditMode = false }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);
  const [imageWidthInput, setImageWidthInput] = useState(String(defaultImageWidth));
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoringHistoryId, setRestoringHistoryId] = useState<string | null>(null);
  const [summaryHistories, setSummaryHistories] = useState<ProjectSummaryHistory[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [textColorPanelOpen, setTextColorPanelOpen] = useState(false);
  const [attachmentSelection, setAttachmentSelection] = useState<AttachmentSelectionState>({
    open: false,
    loading: false,
    filesLoading: false,
    error: undefined,
    parts: [],
    slots: [],
    selectedPartId: undefined,
    selectedSlotId: undefined,
    files: [],
  });
  const [attachmentUploadOpen, setAttachmentUploadOpen] = useState(false);
  const [attachmentUploadLoading, setAttachmentUploadLoading] = useState(false);
  const [attachmentUploadFile, setAttachmentUploadFile] = useState<File | null>(null);
  const attachmentUploadInputRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      TextColor,
      FontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      SummaryImage,
      createSummaryAttachmentExtension(),
    ],
    content: getSummaryContent(project),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'project-summary-editor__content',
      },
      handlePaste: (_view, event) => {
        const imageItems = Array.from(event.clipboardData?.items || []).filter((item) => item.type.startsWith('image/'));

        if (imageItems.length === 0) {
          return false;
        }

        event.preventDefault();

        void (async () => {
          try {
            for (const item of imageItems) {
              const file = item.getAsFile();
              if (!file) {
                continue;
              }

              const dataUrl = await readFileAsDataUrl(file);
              _view.dispatch(
                _view.state.tr.replaceSelectionWith(
                  _view.state.schema.nodes.summaryImage.create({
                    src: dataUrl,
                    width: defaultImageWidth,
                  }),
                ),
              );
            }

            _view.focus();
            message.success('图片已粘贴到 Summary');
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '粘贴图片失败';
            message.error(errorMsg);
          }
        })();

        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.commands.setContent(getSummaryContent(project), { emitUpdate: false });
  }, [editor, project.legacy_summary_html, project.summary_json]);

  useEffect(() => {
    setIsEditing(false);
    setTextColorPanelOpen(false);
    setAttachmentSelection({
      open: false,
      loading: false,
      filesLoading: false,
      error: undefined,
      parts: [],
      slots: [],
      selectedPartId: undefined,
      selectedSlotId: undefined,
      files: [],
    });
    setAttachmentUploadOpen(false);
    setAttachmentUploadFile(null);
  }, [project.id]);

  useEffect(() => {
    if (!startInEditMode) {
      return;
    }

    setIsEditing(true);
  }, [project.id, startInEditMode]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const syncSelectedImage = () => {
      const { selection } = editor.state;

      if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'summaryImage') {
        setSelectedImage(null);
        return;
      }

      setSelectedImage({
        pos: selection.from,
        width: normalizeImageWidth(selection.node.attrs.width),
      });
    };

    syncSelectedImage();
    editor.on('selectionUpdate', syncSelectedImage);
    editor.on('transaction', syncSelectedImage);

    return () => {
      editor.off('selectionUpdate', syncSelectedImage);
      editor.off('transaction', syncSelectedImage);
    };
  }, [editor]);

  useEffect(() => {
    if (!selectedImage) {
      setImageWidthInput(String(defaultImageWidth));
      return;
    }

    setImageWidthInput(String(selectedImage.width));
  }, [selectedImage]);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return defaultToolbarState;
      }

      const paragraphAlign = currentEditor.getAttributes('paragraph').textAlign;
      const headingAlign = currentEditor.getAttributes('heading').textAlign;
      const activeAlign = headingAlign || paragraphAlign || 'left';

      return {
        textStyle: getTextStyleValue(currentEditor),
        textColor: normalizeColorValue(currentEditor.getAttributes('textStyle').color),
        fontSize: normalizeFontSizeValue(currentEditor.getAttributes('textStyle').fontSize),
        bold: currentEditor.isActive('bold'),
        italic: currentEditor.isActive('italic'),
        underline: currentEditor.isActive('underline'),
        bulletList: currentEditor.isActive('bulletList'),
        orderedList: currentEditor.isActive('orderedList'),
        alignLeft: activeAlign === 'left',
        alignCenter: activeAlign === 'center',
        alignRight: activeAlign === 'right',
        canSinkListItem: currentEditor.can().chain().focus().sinkListItem('listItem').run(),
        canLiftListItem: currentEditor.can().chain().focus().liftListItem('listItem').run(),
        canUndo: currentEditor.can().chain().focus().undo().run(),
        canRedo: currentEditor.can().chain().focus().redo().run(),
      };
    },
  }) ?? defaultToolbarState;

  const handleTextStyleChange = (value: SummaryTextStyle) => {
    if (!editor) {
      return;
    }

    if (value === 'paragraph') {
      editor.chain().focus().setParagraph().run();
      return;
    }

    const level = Number.parseInt(value.replace('heading-', ''), 10) as 1 | 2 | 3;
    editor.chain().focus().setHeading({ level }).run();
  };

  const handleFontSizeChange = (value: string) => {
    if (!editor) {
      return;
    }

    editor.chain().focus().setFontSize(`${value}px`).run();
  };

  const handleTextColorChange = (value: string) => {
    if (!editor) {
      return;
    }

    editor.chain().focus().setTextColor(value).run();
    setTextColorPanelOpen(false);
  };

  const handleClearTextColor = () => {
    if (!editor) {
      return;
    }

    editor.chain().focus().unsetTextColor().run();
    setTextColorPanelOpen(false);
  };

  const currentAttachmentSlots = useMemo(() => {
    if (!attachmentSelection.selectedPartId) {
      return [];
    }

    return attachmentSelection.slots.filter((slot) => slot.partId === attachmentSelection.selectedPartId);
  }, [attachmentSelection.selectedPartId, attachmentSelection.slots]);

  const currentAttachmentFiles = useMemo(() => {
    if (!attachmentSelection.selectedSlotId) {
      return [];
    }

    return attachmentSelection.files.filter((file) => file.slot_id === attachmentSelection.selectedSlotId);
  }, [attachmentSelection.files, attachmentSelection.selectedSlotId]);

  const loadAttachmentFiles = async (slotId: string) => {
    setAttachmentSelection((prev) => ({
      ...prev,
      filesLoading: true,
      error: undefined,
      files: [],
    }));

    try {
      const files = await getProjectExistingFiles(project.id);
      setAttachmentSelection((prev) => ({
        ...prev,
        filesLoading: false,
        files: prev.selectedSlotId === slotId ? files : prev.files,
      }));
      return files;
    } catch (err) {
      const errorMsg = getReadableAttachmentError(err, '获取项目文件失败');
      setAttachmentSelection((prev) => ({
        ...prev,
        filesLoading: false,
        files: prev.selectedSlotId === slotId ? [] : prev.files,
        error: prev.selectedSlotId === slotId ? errorMsg : prev.error,
      }));
      message.error(errorMsg);
      return [];
    }
  };

  const handleOpenAttachmentPicker = async () => {
    if (!project.id) {
      message.error('当前项目信息不完整，无法加载文件');
      return;
    }

    setAttachmentSelection((prev) => ({
      ...prev,
      open: true,
      loading: true,
      filesLoading: false,
      error: undefined,
      files: [],
    }));

    try {
      const [parts, matrix] = await Promise.all([
        getProjectParts(project.id),
        getProjectMatrix(project.id),
      ]);
      const nextSlots = matrix.slots.map((slot) => ({
        slotId: slot.slot_id,
        partId: slot.part_id,
        groupType: slot.group_type,
        slotName: slot.document_type,
        label: `${slot.group_type === 'internal' ? '内' : '外'} / ${slot.document_type}`,
      }));

      setAttachmentSelection((prev) => ({
        ...prev,
        loading: false,
        filesLoading: false,
        error: undefined,
        parts,
        slots: nextSlots,
        selectedPartId: undefined,
        selectedSlotId: undefined,
        files: [],
      }));
    } catch (err) {
      const errorMsg = getReadableAttachmentError(err, '获取项目文件失败');
      setAttachmentSelection((prev) => ({
        ...prev,
        loading: false,
        filesLoading: false,
        error: errorMsg,
      }));
      message.error(errorMsg);
    }
  };

  const handleOpenAttachmentUpload = async () => {
    if (!attachmentSelection.selectedPartId || !attachmentSelection.selectedSlotId) {
      message.warning('请先选择 Part 和槽位');
      return;
    }

    setAttachmentUploadOpen(true);
  };

  const handleAttachmentPartChange = (partId: string) => {
    setAttachmentSelection((prev) => ({
      ...prev,
      selectedPartId: partId,
      selectedSlotId: undefined,
      files: [],
      filesLoading: false,
      error: undefined,
    }));
  };

  const handleAttachmentSlotChange = (slotId: string) => {
    setAttachmentSelection((prev) => ({
      ...prev,
      selectedSlotId: slotId,
    }));

    void loadAttachmentFiles(slotId);
  };

  const handleInsertAttachment = (file: ProjectExistingFile) => {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'attachment',
        attrs: {
          uploaded_file_id: file.uploaded_file_id,
          part_no: file.part_no || file.part_name || 'PART',
          group_type: file.group_type,
          slot_name: file.slot_name,
          filename: file.filename,
          file_type: file.file_type || 'file',
        },
      })
      .run();

    setAttachmentSelection({
      open: false,
      loading: false,
      filesLoading: false,
      error: undefined,
      parts: [],
      slots: [],
      selectedPartId: undefined,
      selectedSlotId: undefined,
      files: [],
    });
  };

  const handleUploadAttachment = async () => {
    if (!attachmentSelection.selectedPartId || !attachmentSelection.selectedSlotId) {
      message.warning('请先选择 Part 和槽位');
      return;
    }

    if (!attachmentUploadFile) {
      message.warning('请选择要上传的文件');
      return;
    }

    try {
      setAttachmentUploadLoading(true);
      await uploadFile(attachmentSelection.selectedSlotId, attachmentUploadFile);
      const files = await loadAttachmentFiles(attachmentSelection.selectedSlotId);
      const insertedFile =
        files.find((file) => file.filename === attachmentUploadFile.name && file.slot_id === attachmentSelection.selectedSlotId)
        ?? files.find((file) => file.slot_id === attachmentSelection.selectedSlotId);

      if (insertedFile) {
        handleInsertAttachment(insertedFile);
      } else {
        message.success('文件上传成功，请从列表中选择插入');
      }

      setAttachmentUploadOpen(false);
      setAttachmentUploadFile(null);
      if (attachmentUploadInputRef.current) {
        attachmentUploadInputRef.current.value = '';
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '上传文件失败';
      message.error(errorMsg);
    } finally {
      setAttachmentUploadLoading(false);
    }
  };

  const formatButtons: ToolbarButtonConfig[] = editor
    ? [
        {
          key: 'bold',
          label: '粗体',
          icon: toolbarIcons.bold,
          active: toolbarState.bold,
          onClick: () => editor.chain().focus().toggleBold().run(),
        },
        {
          key: 'italic',
          label: '斜体',
          icon: toolbarIcons.italic,
          active: toolbarState.italic,
          onClick: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          key: 'underline',
          label: '下划线',
          icon: toolbarIcons.underline,
          active: toolbarState.underline,
          onClick: () => editor.chain().focus().toggleUnderline().run(),
        },
      ]
    : [];

  const listButtons: ToolbarButtonConfig[] = editor
    ? [
        {
          key: 'bullet-list',
          label: '无序列表',
          icon: toolbarIcons.bulletList,
          active: toolbarState.bulletList,
          onClick: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          key: 'ordered-list',
          label: '有序列表',
          icon: toolbarIcons.orderedList,
          active: toolbarState.orderedList,
          onClick: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          key: 'indent',
          label: '增加缩进',
          icon: toolbarIcons.indent,
          disabled: !toolbarState.canSinkListItem,
          onClick: () => editor.chain().focus().sinkListItem('listItem').run(),
        },
        {
          key: 'outdent',
          label: '减少缩进',
          icon: toolbarIcons.outdent,
          disabled: !toolbarState.canLiftListItem,
          onClick: () => editor.chain().focus().liftListItem('listItem').run(),
        },
      ]
    : [];

  const alignButtons: ToolbarButtonConfig[] = editor
    ? [
        {
          key: 'align-left',
          label: '左对齐',
          icon: toolbarIcons.alignLeft,
          active: toolbarState.alignLeft,
          onClick: () => editor.chain().focus().setTextAlign('left').run(),
        },
        {
          key: 'align-center',
          label: '居中对齐',
          icon: toolbarIcons.alignCenter,
          active: toolbarState.alignCenter,
          onClick: () => editor.chain().focus().setTextAlign('center').run(),
        },
        {
          key: 'align-right',
          label: '右对齐',
          icon: toolbarIcons.alignRight,
          active: toolbarState.alignRight,
          onClick: () => editor.chain().focus().setTextAlign('right').run(),
        },
        {
          key: 'undo',
          label: '撤销',
          icon: toolbarIcons.undo,
          disabled: !toolbarState.canUndo,
          onClick: () => editor.chain().focus().undo().run(),
        },
        {
          key: 'redo',
          label: '重做',
          icon: toolbarIcons.redo,
          disabled: !toolbarState.canRedo,
          onClick: () => editor.chain().focus().redo().run(),
        },
      ]
    : [];

  const selectedHistory = useMemo(
    () => summaryHistories.find((history) => history.id === selectedHistoryId) ?? null,
    [selectedHistoryId, summaryHistories],
  );
  const loadSummaryHistory = async (preserveSelection = false) => {
    try {
      setHistoryLoading(true);
      const histories = await getProjectSummaryHistory(project.id);
      setSummaryHistories(histories);
      setSelectedHistoryId((prev) => {
        if (preserveSelection && prev && histories.some((history) => history.id === prev)) {
          return prev;
        }
        return histories[0]?.id ?? null;
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '获取历史记录失败';
      message.error(errorMsg);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistoryModal = async () => {
    setHistoryModalOpen(true);
    await loadSummaryHistory(true);
  };

  const handleImageWidthChange = (nextWidth: number) => {
    if (!editor || !selectedImage) {
      return;
    }

    const normalizedWidth = clampImageWidth(nextWidth);
    const currentNode = editor.state.doc.nodeAt(selectedImage.pos);

    if (!currentNode || currentNode.type.name !== 'summaryImage') {
      return;
    }

    const transaction = editor.state.tr.setNodeMarkup(selectedImage.pos, undefined, {
      ...currentNode.attrs,
      width: normalizedWidth,
    });

    editor.view.dispatch(transaction);
    editor.commands.setNodeSelection(selectedImage.pos);
    editor.commands.focus();
  };

  const applyImageWidthInput = () => {
    if (!selectedImage) {
      return;
    }

    const parsed = Number.parseInt(imageWidthInput.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setImageWidthInput(String(selectedImage.width));
      return;
    }

    const normalizedWidth = Math.min(imageWidthInputMax, Math.max(imageWidthInputMin, parsed));
    handleImageWidthChange(normalizedWidth);
    setImageWidthInput(String(normalizedWidth));
  };

  const handleImageWidthStepChange = (direction: -1 | 1) => {
    if (!selectedImage) {
      return;
    }

    const nextWidth = selectedImage.width + direction * imageWidthStep;
    const normalizedWidth = Math.min(imageWidthInputMax, Math.max(imageWidthInputMin, nextWidth));
    handleImageWidthChange(normalizedWidth);
    setImageWidthInput(String(normalizedWidth));
  };

  const handleStartEditing = () => {
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    if (!editor) {
      setIsEditing(false);
      return;
    }

    editor.commands.setContent(getSummaryContent(project), { emitUpdate: false });
    setSelectedImage(null);
    setTextColorPanelOpen(false);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!editor) {
      message.error('编辑器尚未准备完成');
      return;
    }

    try {
      setSaving(true);
      await updateProjectSummary(project.id, {
        summary_json: editor.isEmpty ? null : (editor.getJSON() as JSONContent),
      });
      await onSaved();
      if (historyModalOpen) {
        await loadSummaryHistory();
      }
      setSelectedImage(null);
      setTextColorPanelOpen(false);
      setIsEditing(false);
      message.success('Project Summary 保存成功');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '保存 Project Summary 失败';
      message.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreHistory = async () => {
    if (!selectedHistory) {
      message.warning('请先选择一个历史版本');
      return;
    }

    Modal.confirm({
      title: '恢复历史版本',
      content: '恢复将覆盖当前 Summary 内容，确认继续吗？',
      okText: '确认恢复',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      },
      onOk: async () => {
        try {
          setRestoringHistoryId(selectedHistory.id);
          await restoreProjectSummaryHistory(project.id, selectedHistory.id);
          await onSaved();
          await loadSummaryHistory();
          setIsEditing(false);
          setSelectedImage(null);
          setTextColorPanelOpen(false);
          message.success(`已恢复为 V${selectedHistory.version_no}，并生成新的历史版本`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '恢复历史版本失败';
          message.error(errorMsg);
        } finally {
          setRestoringHistoryId(null);
        }
      },
    });
  };

  return (
    <div
      style={{
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        backgroundColor: 'var(--bg-card)',
        padding: '16px',
        boxShadow: 'var(--shadow-md)',
        display: 'grid',
        gap: '14px',
        height: '72vh',
        minHeight: 0,
        overflow: 'hidden',
        gridTemplateRows: 'auto 1fr',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>Project Summary</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
            记录项目概览、背景说明与关键备注，内容将以文档 JSON 形式保存。
          </div>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button onClick={handleOpenHistoryModal}>
              历史记录
            </Button>
            {isEditing ? (
              <>
                <Button onClick={handleCancelEditing} disabled={saving}>
                  取消编辑
                </Button>
                <Button type="primary" onClick={handleSave} loading={saving}>
                  保存 Summary
                </Button>
              </>
            ) : (
              <Button type="primary" onClick={handleStartEditing}>
                编辑 Summary
              </Button>
            )}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            {project.summary_updated_at
              ? `上次保存：${formatDateTime(project.summary_updated_at)}`
              : '尚未保存过 Summary'}
          </div>
        </div>
      </div>

      <div
        className="project-summary-editor"
        style={{
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          gridTemplateRows: isEditing ? 'auto auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
        }}
      >
        {isEditing ? (
          <>
            <div className="project-summary-editor__toolbar">
              <div className="project-summary-editor__toolbar-group">
                <label className="project-summary-editor__select-wrap">
                  <span className="project-summary-editor__sr-only">样式</span>
                  <select
                    className="project-summary-editor__select"
                    value={toolbarState.textStyle}
                    onChange={(event) => handleTextStyleChange(event.target.value as SummaryTextStyle)}
                    disabled={!editor}
                  >
                    <option value="paragraph">正文</option>
                    <option value="heading-1">标题 1</option>
                    <option value="heading-2">标题 2</option>
                    <option value="heading-3">标题 3</option>
                  </select>
                </label>
                <label className="project-summary-editor__select-wrap">
                  <span className="project-summary-editor__sr-only">字号</span>
                  <select
                    className="project-summary-editor__select project-summary-editor__select--size"
                    value={toolbarState.fontSize}
                    onChange={(event) => handleFontSizeChange(event.target.value)}
                    disabled={!editor}
                  >
                    {fontSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="project-summary-editor__color-wrap">
                  <button
                    type="button"
                    className="project-summary-editor__color-button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setTextColorPanelOpen((current) => !current)}
                    disabled={!editor}
                    aria-label="字体颜色"
                    title="字体颜色"
                  >
                    <span
                      className="project-summary-editor__color-swatch"
                      style={{ backgroundColor: toolbarState.textColor }}
                      aria-hidden="true"
                    />
                  </button>
                  {textColorPanelOpen && editor ? (
                    <div className="project-summary-editor__color-panel" role="menu" aria-label="字体颜色">
                      <button
                        type="button"
                        className="project-summary-editor__color-option project-summary-editor__color-option--clear"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={handleClearTextColor}
                        title="恢复默认颜色"
                      >
                        默认
                      </button>
                      {textColorPalette.map((color) => {
                        const active = toolbarState.textColor === color;

                        return (
                          <button
                            key={color}
                            type="button"
                            className={`project-summary-editor__color-option${active ? ' is-active' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleTextColorChange(color)}
                            title={color}
                            aria-label={color}
                          >
                            <span className="project-summary-editor__color-swatch" style={{ backgroundColor: color }} />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="project-summary-editor__icon-button"
                  onClick={handleOpenAttachmentPicker}
                  disabled={!editor}
                  aria-label="插入文件"
                  title="插入文件"
                >
                  {toolbarIcons.attachment}
                </button>
              </div>
              <div className="project-summary-editor__toolbar-divider" />
              <div className="project-summary-editor__toolbar-group">
                {formatButtons.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    className={`project-summary-editor__icon-button${button.active ? ' is-active' : ''}`}
                    onClick={button.onClick}
                    disabled={button.disabled}
                    aria-label={button.label}
                    title={button.label}
                  >
                    {button.icon}
                  </button>
                ))}
              </div>
              <div className="project-summary-editor__toolbar-divider" />
              <div className="project-summary-editor__toolbar-group">
                {listButtons.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    className={`project-summary-editor__icon-button${button.active ? ' is-active' : ''}`}
                    onClick={button.onClick}
                    disabled={button.disabled}
                    aria-label={button.label}
                    title={button.label}
                  >
                    {button.icon}
                  </button>
                ))}
              </div>
              <div className="project-summary-editor__toolbar-divider" />
              <div className="project-summary-editor__toolbar-group">
                {alignButtons.map((button) => (
                  <button
                    key={button.key}
                    type="button"
                    className={`project-summary-editor__icon-button${button.active ? ' is-active' : ''}`}
                    onClick={button.onClick}
                    disabled={button.disabled}
                    aria-label={button.label}
                    title={button.label}
                  >
                    {button.icon}
                  </button>
                ))}
              </div>
              {selectedImage ? (
                <>
                  <div className="project-summary-editor__toolbar-divider" />
                  <div className="project-summary-editor__toolbar-group project-summary-editor__media-inline">
                    <div className="project-summary-editor__media-label">图片宽度</div>
                    <div className="project-summary-editor__media-controls">
                      <button
                        type="button"
                        className="project-summary-editor__media-stepper"
                        onClick={() => handleImageWidthStepChange(-1)}
                        aria-label="减小图片宽度"
                        title="减小图片宽度"
                      >
                        -
                      </button>
                      <input
                        className="project-summary-editor__media-input"
                        type="number"
                        min={imageWidthInputMin}
                        max={imageWidthInputMax}
                        step={imageWidthStep}
                        value={imageWidthInput}
                        onChange={(event) => setImageWidthInput(event.target.value.replace(/[^\d]/g, ''))}
                        onBlur={applyImageWidthInput}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            applyImageWidthInput();
                          }
                        }}
                        onWheel={(event) => {
                          if (document.activeElement !== event.currentTarget) {
                            return;
                          }
                          event.preventDefault();
                          handleImageWidthStepChange(event.deltaY < 0 ? 1 : -1);
                        }}
                        aria-label="图片宽度"
                      />
                      <div className="project-summary-editor__media-unit">px</div>
                      <button
                        type="button"
                        className="project-summary-editor__media-stepper"
                        onClick={() => handleImageWidthStepChange(1)}
                        aria-label="增大图片宽度"
                        title="增大图片宽度"
                      >
                        +
                      </button>
                    </div>
                    <div className="project-summary-editor__media-value">{selectedImage.width}px</div>
                    <div className="project-summary-editor__media-presets">
                      {[320, 480, 720].map((presetWidth) => (
                        <Button
                          key={presetWidth}
                          onClick={() => handleImageWidthChange(presetWidth)}
                          style={{
                            borderColor: selectedImage.width === presetWidth ? 'var(--primary-border)' : 'var(--border-strong)',
                            color: selectedImage.width === presetWidth ? 'var(--primary-color)' : 'var(--text-secondary)',
                            backgroundColor: selectedImage.width === presetWidth ? 'var(--primary-soft)' : 'var(--bg-card)',
                          }}
                        >
                          {presetWidth}px
                        </Button>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div
              className="project-summary-editor__surface"
              style={{
                minHeight: 0,
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <div className="project-summary-editor__scroll">
                <EditorContent editor={editor} />
              </div>
            </div>
          </>
        ) : (
          <div
            className="project-summary-editor__surface"
            style={{
              minHeight: 0,
              height: isEditing ? '100%' : '100%',
              overflow: 'hidden',
            }}
          >
            {hasSummaryContent(project) ? (
              <ProjectSummaryDocument source={project} minHeight={320} height="100%" />
            ) : (
              <Empty description="暂无 Summary 内容，点击“编辑 Summary”开始填写" style={{ margin: '32px 0' }} />
            )}
          </div>
        )}
      </div>
      <Modal
        title="选择项目文件"
        open={attachmentSelection.open}
        onCancel={() => {
          if (attachmentSelection.loading) {
            return;
          }
          setAttachmentSelection({
            open: false,
            loading: false,
            filesLoading: false,
            error: undefined,
            parts: [],
            slots: [],
            selectedPartId: undefined,
            selectedSlotId: undefined,
            files: [],
          });
        }}
        footer={null}
        width={720}
        className="project-summary-file-picker"
      >
        <div style={{ display: 'grid', gap: '10px', minHeight: '390px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr) auto', gap: '10px' }}>
            <Select
              value={attachmentSelection.selectedPartId}
              onChange={handleAttachmentPartChange}
              placeholder="选择 Part"
              options={attachmentSelection.parts.map((part) => ({
                label: [part.part_no, part.part_name].filter(Boolean).join(' / ') || part.part_name,
                value: part.id,
              }))}
            />
            <Select
              value={attachmentSelection.selectedSlotId}
              onChange={handleAttachmentSlotChange}
              placeholder="选择槽位"
              disabled={!attachmentSelection.selectedPartId}
              options={currentAttachmentSlots.map((slot) => ({
                label: slot.label,
                value: slot.slotId,
              }))}
            />
            <Button
              onClick={() => void handleOpenAttachmentUpload()}
              disabled={!attachmentSelection.selectedPartId || !attachmentSelection.selectedSlotId}
            >
              + 上传文件
            </Button>
          </div>
          <div
            style={{
              border: '1px solid var(--overlay-border)',
              borderRadius: '10px',
              backgroundColor: 'var(--overlay-panel-bg)',
              minHeight: 0,
              height: '50vh',
              padding: '8px',
              display: 'grid',
              gridTemplateRows: 'auto minmax(0, 1fr)',
              gap: '8px',
            }}
          >
            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>
              {attachmentSelection.selectedSlotId ? '当前槽位文件' : '请先选择 Part 和槽位'}
            </div>
            <div style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gap: '0', paddingRight: '2px' }}>
              {attachmentSelection.loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <Spin size="small" tip="项目文件加载中..." />
                </div>
              ) : !attachmentSelection.selectedPartId || !attachmentSelection.selectedSlotId ? (
                <Empty description="请选择 Part 和槽位后查看文件" />
              ) : attachmentSelection.filesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
                  <Spin size="small" tip="槽位文件加载中..." />
                </div>
              ) : attachmentSelection.error ? (
                <Empty description={attachmentSelection.error} />
              ) : currentAttachmentFiles.length === 0 ? (
                <Empty description="当前槽位暂无可引用文件" />
              ) : (
                currentAttachmentFiles.map((file) => (
                  <button
                    key={file.uploaded_file_id}
                    type="button"
                    onClick={() => handleInsertAttachment(file)}
                    title={[
                      `${file.group_type === 'internal' ? '内' : '外'} / ${file.slot_name}`,
                      file.uploaded_at ? formatDateTime(file.uploaded_at) : '',
                      file.filename,
                    ]
                      .filter(Boolean)
                      .join(' / ')}
                    className="project-summary-file-picker__row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      textAlign: 'left',
                      width: '100%',
                      padding: '5px 6px',
                      border: 'none',
                      borderBottom: '1px solid var(--overlay-border)',
                      borderRadius: '0',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      minHeight: '0',
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: '28px',
                        height: '22px',
                        borderRadius: '5px',
                        backgroundColor: 'var(--primary-soft)',
                        color: 'var(--primary-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        flex: '0 0 auto',
                      }}
                    >
                      {getAttachmentTypeLabel(file.file_type)}
                    </div>
                    <div style={{ minWidth: 0, flex: '1 1 auto', display: 'grid', gap: '1px' }}>
                      <div
                        style={{
                          color: 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.2,
                        }}
                      >
                        {file.filename}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.25 }}>
                        {[
                          `${file.group_type === 'internal' ? '内' : '外'} / ${file.slot_name}`,
                          file.uploaded_at ? formatDateTime(file.uploaded_at) : '',
                        ].filter(Boolean).join('  ·  ')}
                      </div>
                    </div>
                    <div
                      style={{
                        flex: '0 0 auto',
                        padding: '0 8px',
                        minHeight: '24px',
                        borderRadius: '999px',
                        border: '1px solid var(--primary-border)',
                        backgroundColor: 'var(--primary-soft)',
                        color: 'var(--primary-color)',
                        fontSize: '11px',
                        fontWeight: 600,
                        lineHeight: '22px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      插入引用
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        title="上传文件到现有槽位"
        open={attachmentUploadOpen}
        onCancel={() => {
          if (attachmentUploadLoading) {
            return;
          }
          setAttachmentUploadOpen(false);
          setAttachmentUploadFile(null);
          if (attachmentUploadInputRef.current) {
            attachmentUploadInputRef.current.value = '';
          }
        }}
        onOk={() => void handleUploadAttachment()}
        okText="上传并插入"
        cancelText="取消"
        confirmLoading={attachmentUploadLoading}
      >
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700 }}>当前槽位</div>
            <div
              style={{
                minHeight: '34px',
                borderRadius: '8px',
                border: '1px solid var(--border-strong)',
                backgroundColor: 'var(--bg-card-soft)',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                fontSize: '13px',
              }}
            >
              {currentAttachmentSlots.find((slot) => slot.slotId === attachmentSelection.selectedSlotId)?.label || '未选择槽位'}
            </div>
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700 }}>选择文件</div>
            <input
              ref={attachmentUploadInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(event) => {
                const nextFile = event.target.files?.[0] || null;
                setAttachmentUploadFile(nextFile);
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Button onClick={() => attachmentUploadInputRef.current?.click()}>
                选择文件
              </Button>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                {attachmentUploadFile?.name || '未选择文件'}
              </div>
            </div>
          </div>
        </div>
      </Modal>
      <Modal
        title="Summary 历史记录"
        open={historyModalOpen}
        onCancel={() => {
          if (historyLoading || restoringHistoryId) {
            return;
          }
          setHistoryModalOpen(false);
        }}
        footer={null}
        width={960}
        styles={{
          body: {
            height: '76vh',
            overflow: 'hidden',
          },
        }}
      >
        {historyLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '36px 0' }}>
            <Spin size="small" tip="历史记录加载中..." />
          </div>
        ) : summaryHistories.length === 0 ? (
          <Empty description="暂无历史记录，保存 Summary 后会生成版本快照" />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '280px minmax(0, 1fr)',
              gap: '16px',
              height: '100%',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                border: '1px solid var(--border-strong)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
                padding: '10px',
                display: 'grid',
                gridTemplateRows: 'minmax(0, 1fr)',
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  minHeight: 0,
                  height: '100%',
                  overflowY: 'auto',
                  display: 'grid',
                  alignContent: 'start',
                  gap: '8px',
                  paddingRight: '4px',
                }}
              >
                {summaryHistories.map((history) => {
                  const active = history.id === selectedHistoryId;

                  return (
                    <button
                      key={history.id}
                      type="button"
                      onClick={() => setSelectedHistoryId(history.id)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: active ? '1px solid var(--primary-border)' : '1px solid var(--border-strong)',
                        backgroundColor: active ? 'var(--primary-soft)' : 'var(--bg-card)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{`V${history.version_no}`}</div>
                      <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
                        {formatDateTime(history.created_at)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              style={{
                border: '1px solid var(--border-strong)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card)',
                minWidth: 0,
                display: 'grid',
                gridTemplateRows: 'auto minmax(0, 1fr)',
                minHeight: 0,
                height: '100%',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'grid', gap: '4px' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedHistory ? `版本 V${selectedHistory.version_no}` : '选择一个历史版本'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {selectedHistory ? formatDateTime(selectedHistory.created_at) : '暂无可预览内容'}
                  </div>
                </div>
                <Button
                  type="primary"
                  onClick={handleRestoreHistory}
                  loading={restoringHistoryId === selectedHistory?.id}
                  disabled={!selectedHistory}
                >
                  恢复为当前版本
                </Button>
              </div>
              <div style={{ minHeight: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                {selectedHistory && hasSummaryContent(selectedHistory) ? (
                  <ProjectSummaryDocument source={selectedHistory} minHeight={320} height="100%" />
                ) : (
                  <Empty description="该历史版本内容为空" />
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProjectSummaryEditor;
