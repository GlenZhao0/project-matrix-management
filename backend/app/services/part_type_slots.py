# Part Type -> 默认槽位映射表
PART_TYPE_DEFAULT_SLOTS = {
    'Assembly': ['FAI', 'CPK', 'DWG'],
    'Component': ['FAI', 'DWG'],
    'Fastener': ['FAI'],
    'Subassembly': ['FAI', 'CPK', 'DWG'],
}


def get_default_slots_for_part_type(part_type_name: str | None) -> list[str]:
    """
    根据 Part Type 获取默认槽位列表
    
    Args:
        part_type_name: Part Type 名称
        
    Returns:
        默认槽位名称列表
        如果 part_type_name 为空或未配置，返回 ['FAI'] 作为保守方案
    """
    if not part_type_name or not part_type_name.strip():
        return ['FAI']
    
    return PART_TYPE_DEFAULT_SLOTS.get(part_type_name.strip(), ['FAI'])
