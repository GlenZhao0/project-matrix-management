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
  className?: string;
  title?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  type = 'default',
  size = 'middle',
  loading = false,
  disabled = false,
  style,
  className,
  title,
}) => {
  const sizeStyles: Record<NonNullable<ButtonProps['size']>, React.CSSProperties> = {
    small: { height: '28px', padding: type === 'text' ? '0 6px' : '0 10px', fontSize: '12px' },
    middle: { height: '32px', padding: type === 'text' ? '0 8px' : '0 14px', fontSize: '13px' },
    large: { height: '36px', padding: type === 'text' ? '0 10px' : '0 16px', fontSize: '14px' },
  };

  const baseStyle: React.CSSProperties = {
    borderRadius: '8px',
    fontWeight: 600,
    ...sizeStyles[size],
  };

  return (
    <AntButton
      type={type}
      size={size}
      onClick={onClick}
      loading={loading}
      disabled={disabled || loading}
      className={className}
      title={title}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </AntButton>
  );
};

export default Button;
