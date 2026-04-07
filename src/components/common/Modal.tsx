import React from 'react';
import { Modal as AntModal } from 'antd';

interface ModalProps {
  title: string;
  open: boolean;
  onCancel: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, open, onCancel, children }) => {
  return (
    <AntModal title={title} open={open} onCancel={onCancel} footer={null}>
      {children}
    </AntModal>
  );
};

export default Modal;