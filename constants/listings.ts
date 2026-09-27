type PricedListing = { listing_type?: string; budget_min_ngn?: number | null; budget_max_ngn?: number | null };
export function formatListingPrice(listing: PricedListing): string {
  const min = listing.budget_min_ngn;
  const max = listing.budget_max_ngn;
  if (listing.listing_type === 'service_offer') {
    if (min != null && max != null && min !== max) return `NGN ${Number(min).toLocaleString()} - ${Number(max).toLocaleString()}`;
    if (min != null) return `From NGN ${Number(min).toLocaleString()}`;
    if (max != null) return `Up to NGN ${Number(max).toLocaleString()}`;
    return 'Contact for pricing';
  }
  return max != null ? `Budget up to NGN ${Number(max).toLocaleString()}` : min != null ? `Budget from NGN ${Number(min).toLocaleString()}` : 'Budget negotiable';
}
