import React from 'react';
import { Button as AntButton } from 'antd';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  loading?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const Button: React.FC<ButtonProps> = ({ children, onClick, type = 'default', loading = false, disabled = false, style }) => {
  return (
    <AntButton type={type} onClick={onClick} loading={loading} disabled={disabled || loading} style={style}>
      {children}
    </AntButton>
  );
};

export default Button;
