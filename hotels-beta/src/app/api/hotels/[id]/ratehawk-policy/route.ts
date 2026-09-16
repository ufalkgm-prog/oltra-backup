import { NextRequest, NextResponse } from "next/server";
import { getItemById } from "@/lib/directus";
import {
  formatMetapolicyExtraInfo,
  formatMetapolicyStruct,
  formatPolicyTime,
  type HotelPolicies,
} from "@/lib/ratehawk/metapolicy";

// One published hotel's ETG policies (metapolicy_struct + metapolicy_extra_info,
// and check-in/out times) for the Hotels page's selected hotel — read from what
// the daily sync stored (§48), never from ETG live. Per hotel, like the
// description route, and never part of a bulk hotel field list.

type RawHotelPolicies = {
  published?: boolean | null;
  ratehawk_metapolicy_struct?: unknown;
  ratehawk_metapolicy_extra_info?: string | null;
  ratehawk_check_in_time?: string | null;
  ratehawk_check_out_time?: string | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Missing hotel id" }, { status: 400 });
  }

  try {
    const hotel = await getItemById<RawHotelPolicies>("hotels", id, {
      fields: [
        "published",
        "ratehawk_metapolicy_struct",
        "ratehawk_metapolicy_extra_info",
        "ratehawk_check_in_time",
        "ratehawk_check_out_time",
      ],
    });
    if (hotel.published !== true) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const policies: HotelPolicies = {
      checkIn: formatPolicyTime(hotel.ratehawk_check_in_time),
      checkOut: formatPolicyTime(hotel.ratehawk_check_out_time),
      sections: formatMetapolicyStruct(hotel.ratehawk_metapolicy_struct),
      extraInfo: formatMetapolicyExtraInfo(hotel.ratehawk_metapolicy_extra_info),
    };
    return NextResponse.json({ ok: true, policies });
  } catch (error) {
    console.error("HOTEL POLICIES ERROR:", error);
    return NextResponse.json(
      { ok: false, error: "Could not load the hotel policies." },
      { status: 500 }
    );
  }
}
