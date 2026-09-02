import type { Offering } from "../../../shared/contracts/catalog";

export function offeringLabel(offering: Offering) {
	const parts = [offering.label];
	if (offering.packQuantity !== null) parts.push(`${offering.packQuantity} pack`);
	if (offering.weightValue !== null && offering.weightUnit !== null) parts.push(`${offering.weightValue} ${offering.weightUnit}`);
	return parts.join(" · ");
}
