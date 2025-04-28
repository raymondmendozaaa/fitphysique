export function groupPlanDurationsByName(planDurations) {
    const grouped = {};
  
    for (const item of planDurations) {
      const plan = item.plan_name;
      if (!grouped[plan]) {
        grouped[plan] = [];
      }
      grouped[plan].push(item);
    }
  
    return grouped;
  }