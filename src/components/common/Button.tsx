import React from 'react';
import { Button as AntButton } from 'antd';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'primary' | 'default' | 'dashed' | 'text' | 'link';
  size?: 'large' | 'middle' | 'small';
  loading?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const Button: React.FC<ButtonProps> = ({ children, onClick, type = 'default', size = 'middle', loading = false, disabled = false, style }) => {
  return (
    <AntButton type={type} size={size} onClick={onClick} loading={loading} disabled={disabled || loading} style={style}>
      {children}
    </AntButton>
  );
};

export default Button;
