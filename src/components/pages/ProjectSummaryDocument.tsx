import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension, JSONContent, mergeAttributes, Node } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { Empty, Modal, Spin, message } from 'antd';
import { API_BASE_URL } from '../../api/client';
import { getProjectExistingFilePreview, openProjectExistingFile, ProjectExistingFilePreview } from '../../api/projects';

interface ProjectSummaryDocumentProps {
  source: {
    id?: string;
    project_id?: string;
    summary_json?: JSONContent | null;
    legacy_summary_html?: string | null;
  };
  className?: string;
  minHeight?: number;
  height?: number | string;
}

const emptyEditorHtml = '<p></p>';
const defaultImageWidth = 480;
const minImageWidth = 120;
const maxImageWidth = 960;
const attachmentClickDelayMs = 220;

export const getAttachmentTypeLabel = (fileType?: string | null) => {
  const normalized = (fileType || '').trim().toLowerCase();
  if (!normalized) {
    return 'FILE';
  }

  if (normalized.length <= 4) {
    return normalized.toUpperCase();
  }

  return normalized.slice(0, 4).toUpperCase();
};

const getAttachmentGroupLabel = (groupType?: string | null) => {
  return groupType === 'internal' ? '内' : '外';
};

const DisplayFontSize = Extension.create({
  name: 'displayFontSize',

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
});

const DisplayTextColor = Extension.create({
  name: 'displayTextColor',

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

const SummaryImage = Node.create({
  name: 'summaryImage',
  group: 'block',
  draggable: false,
  selectable: false,
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

export const createSummaryAttachmentExtension = () =>
  Node.create({
    name: 'attachment',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        uploaded_file_id: {
          default: null,
        },
        part_no: {
          default: null,
        },
        group_type: {
          default: 'external',
        },
        slot_name: {
          default: null,
        },
        filename: {
          default: null,
        },
        file_type: {
          default: 'file',
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'div[data-summary-attachment]',
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      const partNo = HTMLAttributes.part_no || 'PART';
      const groupLabel = getAttachmentGroupLabel(HTMLAttributes.group_type);
      const slotName = HTMLAttributes.slot_name || '文件';
      const filename = HTMLAttributes.filename || '未命名文件';
      const tooltip = `${partNo} / ${groupLabel} / ${slotName} / ${filename}`;

      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-summary-attachment': 'true',
          class: 'project-summary-attachment',
          contenteditable: 'false',
          title: tooltip,
        }),
        ['span', { class: 'project-summary-attachment__part' }, partNo],
        ['span', { class: 'project-summary-attachment__sep' }, '/'],
        ['span', { class: 'project-summary-attachment__group' }, groupLabel],
        ['span', { class: 'project-summary-attachment__sep' }, '/'],
        ['span', { class: 'project-summary-attachment__slot' }, slotName],
        ['span', { class: 'project-summary-attachment__sep' }, '/'],
        ['span', { class: 'project-summary-attachment__file', title: filename }, filename],
      ];
    },
  });

export const getSummaryContent = (source: { summary_json?: JSONContent | null; legacy_summary_html?: string | null }) => {
  if (source.summary_json) {
    return source.summary_json;
  }

  if (source.legacy_summary_html?.trim()) {
    return source.legacy_summary_html.trim();
  }

  return emptyEditorHtml;
};

export const hasSummaryContent = (source: { summary_json?: JSONContent | null; legacy_summary_html?: string | null }) => {
  if (source.summary_json) {
    const hasContent = source.summary_json.content?.some((node) => {
      if (node.type === 'summaryImage') {
        return true;
      }

      if (node.type === 'attachment') {
        return true;
      }

      if (node.type === 'paragraph') {
        return node.content?.some((child) => child.type === 'text' && child.text?.trim());
      }

      return Boolean(node.content?.length);
    });

    return Boolean(hasContent);
  }

  return Boolean(source.legacy_summary_html?.trim());
};

const ProjectSummaryDocument: React.FC<ProjectSummaryDocumentProps> = ({
  source,
  className = 'project-summary-history-preview',
  minHeight = 220,
  height,
}) => {
  const projectId = source.id || source.project_id || '';
  const clickTimeoutRef = useRef<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<ProjectExistingFilePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewContentUrl = useMemo(() => {
    if (!projectId || !previewData?.uploaded_file_id) {
      return '';
    }
    return `${API_BASE_URL}/projects/${projectId}/files/${previewData.uploaded_file_id}/content`;
  }, [previewData?.uploaded_file_id, projectId]);

  const clearPendingClick = () => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
  };

  const openAttachmentPreview = async (uploadedFileId: string) => {
    if (!projectId) {
      return;
    }

    try {
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewError(null);
      const nextPreview = await getProjectExistingFilePreview(projectId, uploadedFileId);
      setPreviewData(nextPreview);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '加载文件预览失败';
      setPreviewError(errorMsg);
      message.error(errorMsg);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAttachmentOpen = async (uploadedFileId: string) => {
    if (!projectId) {
      return;
    }

    try {
      await openProjectExistingFile(projectId, uploadedFileId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '打开文件失败';
      message.error(errorMsg);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      DisplayTextColor,
      DisplayFontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      SummaryImage,
      createSummaryAttachmentExtension(),
    ],
    content: getSummaryContent(source),
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: className,
      },
      handleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== 'attachment' || !projectId) {
          return false;
        }

        const target = event.target as HTMLElement | null;
        if (!target?.closest('[data-summary-attachment]')) {
          return false;
        }

        const uploadedFileId = node.attrs.uploaded_file_id as string | null | undefined;
        if (!uploadedFileId) {
          message.warning('该文件引用缺少文件标识');
          return true;
        }

        clearPendingClick();
        clickTimeoutRef.current = window.setTimeout(() => {
          void openAttachmentPreview(uploadedFileId);
          clickTimeoutRef.current = null;
        }, attachmentClickDelayMs);
        return true;
      },
      handleDoubleClickOn: (_view, _pos, node, _nodePos, event) => {
        if (node.type.name !== 'attachment' || !projectId) {
          return false;
        }

        const target = event.target as HTMLElement | null;
        if (!target?.closest('[data-summary-attachment]')) {
          return false;
        }

        const uploadedFileId = node.attrs.uploaded_file_id as string | null | undefined;
        if (!uploadedFileId) {
          message.warning('该文件引用缺少文件标识');
          return true;
        }

        clearPendingClick();
        void handleAttachmentOpen(uploadedFileId);
        return true;
      },
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.commands.setContent(getSummaryContent(source), { emitUpdate: false });
  }, [editor, source]);

  useEffect(() => {
    return () => {
      clearPendingClick();
    };
  }, []);

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight,
          height,
          minWidth: 0,
          padding: '16px 18px',
          overflow: 'hidden',
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <Modal
        title={previewData?.filename || '附件预览'}
        open={previewOpen}
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewData(null);
          setPreviewError(null);
        }}
        footer={null}
        width={960}
      >
        <div style={{ minHeight: '58vh', display: 'grid', gap: '12px' }}>
          {previewLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '36px 0' }}>
              <Spin size="small" tip="预览加载中..." />
            </div>
          ) : previewError ? (
            <Empty description={previewError} />
          ) : !previewData ? (
            <Empty description="暂无可预览内容" />
          ) : previewData.preview_kind === 'text' ? (
            <pre
              style={{
                margin: 0,
                minHeight: '58vh',
                maxHeight: '58vh',
                overflow: 'auto',
                padding: '14px 16px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewData.text_content || ''}
            </pre>
          ) : previewData.preview_kind === 'pdf' ? (
            <iframe
              title={previewData.filename}
              src={previewContentUrl}
              style={{
                width: '100%',
                height: '58vh',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card)',
              }}
            />
          ) : previewData.preview_kind === 'image' ? (
            <div
              style={{
                minHeight: '58vh',
                maxHeight: '58vh',
                overflow: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '12px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
              }}
            >
              <img
                src={previewContentUrl}
                alt={previewData.filename}
                style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}
              />
            </div>
          ) : (
            <div
              style={{
                minHeight: '58vh',
                display: 'grid',
                alignContent: 'start',
                gap: '12px',
                padding: '16px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                backgroundColor: 'var(--bg-card-soft)',
              }}
            >
              <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 700 }}>{previewData.filename}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>文件类型：{getAttachmentTypeLabel(previewData.file_type)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>该类型暂不支持在线预览</div>
              <div>
                <button
                  type="button"
                  onClick={() => void handleAttachmentOpen(previewData.uploaded_file_id)}
                  style={{
                    border: '1px solid var(--primary-border)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-soft)',
                    color: 'var(--primary-color)',
                    padding: '8px 12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  打开文件
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default ProjectSummaryDocument;
