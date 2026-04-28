interface GenericRecord {
  [key: string]: unknown;
}

function withCookieHeaders(cookie: string) {
  return {
    Cookie: cookie,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Accept: "application/json, text/plain, */*"
  };
}

async function getJson(url: string, cookie: string): Promise<GenericRecord> {
  const response = await fetch(url, {
    method: "GET",
    headers: withCookieHeaders(cookie)
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as GenericRecord;
  } catch {
    return {
      state: false,
      message: `Invalid JSON response from 115: ${text.slice(0, 200)}`
    };
  }
}

function extractArray(payload: unknown): GenericRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((v): v is GenericRecord => typeof v === "object" && v !== null);
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const asRecord = payload as GenericRecord;
  if (Array.isArray(asRecord.data)) {
    return extractArray(asRecord.data);
  }

  if (asRecord.data && typeof asRecord.data === "object") {
    const dataRecord = asRecord.data as GenericRecord;

    if (Array.isArray(dataRecord.list)) {
      return extractArray(dataRecord.list);
    }

    const values = Object.values(dataRecord).filter(
      (value) => typeof value === "object" && value !== null
    );
    if (values.length > 0) {
      return values as GenericRecord[];
    }
  }

  return [];
}

function readString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function readTotal(body: GenericRecord): number {
  return readNumber(body.count || body.total || body.file_count);
}

function isFolderRow(row: GenericRecord): boolean {
  const hasCid = Boolean(readString(row.cid || row.file_id));
  const hasName = Boolean(readString(row.n || row.file_name || row.name));
  const isDirFlag = row.is_dir === 1 || row.is_dir === "1" || row.fc === "1";
  const hasFileId = Boolean(row.fid);
  return hasCid && hasName && (isDirFlag || !hasFileId);
}

export const client115 = {
  async validateCookie(cookie: string): Promise<{ valid: boolean; message: string }> {
    const body = await getJson(
      "https://webapi.115.com/files?aid=1&cid=0&offset=0&limit=1&show_dir=1",
      cookie
    );

    const state = body.state;
    if (state === true || state === 1) {
      return { valid: true, message: "Cookie is valid." };
    }

    return {
      valid: false,
      message: readString(body.error_msg || body.message || "Cookie is invalid or expired.")
    };
  },

  async searchFolders(params: {
    cookie: string;
    keyword?: string;
    parentId?: string;
    page?: number;
  }): Promise<Array<{ cid: string; name: string; parentId?: string }>> {
    const parentId = params.parentId || "0";
    const page = params.page || 1;
    const offset = (page - 1) * 100;

    let url = "";
    if (params.keyword && params.keyword.trim()) {
      const keyword = encodeURIComponent(params.keyword.trim());
      url = `https://webapi.115.com/files/search?offset=${offset}&limit=100&aid=1&cid=${parentId}&format=json&search_value=${keyword}`;
    } else {
      url = `https://webapi.115.com/files?aid=1&cid=${parentId}&offset=${offset}&limit=100&show_dir=1`;
    }

    const body = await getJson(url, params.cookie);
    const rows = extractArray(body).filter(isFolderRow);

    return rows
      .map((row) => ({
        cid: readString(row.cid || row.file_id),
        name: readString(row.n || row.file_name || row.name),
        parentId: readString(row.pid || row.parent_id)
      }))
      .filter((row) => row.cid && row.name);
  },

  async listFileNames(cookie: string, cid: string): Promise<Set<string>> {
    const names = new Set<string>();
    let offset = 0;
    const limit = 1150;

    while (true) {
      const url = `https://webapi.115.com/files?aid=1&cid=${cid}&o=file_name&asc=1&offset=${offset}&show_dir=0&limit=${limit}`;
      const body = await getJson(url, cookie);
      const list = extractArray(body);

      for (const row of list) {
        const name = readString(row.n || row.file_name || row.name);
        if (name) {
          names.add(name);
        }
      }

      if (list.length < limit) {
        break;
      }
      offset += limit;
    }

    return names;
  },

  async listFilesPage(params: {
    cookie: string;
    cid: string;
    page?: number;
    limit?: number;
    keyword?: string;
  }): Promise<{
    items: Array<{
      id: string;
      name: string;
      size: number;
      sha1?: string;
      pickCode?: string;
      mtime?: number;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    let url = "";
    if (params.keyword && params.keyword.trim()) {
      const keyword = encodeURIComponent(params.keyword.trim());
      url = `https://webapi.115.com/files/search?offset=${offset}&limit=${limit}&aid=1&cid=${params.cid}&format=json&search_value=${keyword}`;
    } else {
      url = `https://webapi.115.com/files?aid=1&cid=${params.cid}&offset=${offset}&limit=${limit}&show_dir=0`;
    }

    const body = await getJson(url, params.cookie);
    const rows = extractArray(body).filter((row) => !isFolderRow(row));

    return {
      items: rows
        .map((row) => ({
          id: readString(row.fid || row.file_id || row.id),
          name: readString(row.n || row.file_name || row.name),
          size: readNumber(row.s || row.size || row.file_size),
          sha1: readString(row.sha || row.sha1 || row.file_sha1) || undefined,
          pickCode: readString(row.pc || row.pick_code || row.pickcode) || undefined,
          mtime: readNumber(row.te || row.t || row.update_time || row.user_ptime) || undefined
        }))
        .filter((item) => item.name),
      total: readTotal(body),
      page,
      limit
    };
  },

  async fileExistsByName(params: {
    cookie: string;
    cid: string;
    fileName: string;
  }): Promise<boolean> {
    const exactName = params.fileName.trim();
    if (!exactName) {
      return false;
    }

    const exactMatch = (rows: GenericRecord[]) =>
      rows.some((row) => readString(row.n || row.file_name || row.name) === exactName);

    const keyword = encodeURIComponent(exactName);
    const searchUrl = `https://webapi.115.com/files/search?offset=0&limit=100&aid=1&cid=${params.cid}&format=json&search_value=${keyword}`;
    const searchBody = await getJson(searchUrl, params.cookie);
    const searchRows = extractArray(searchBody).filter((row) => !isFolderRow(row));
    if (exactMatch(searchRows)) {
      return true;
    }

    // Fallback: check newest files under target folder.
    const recentUrl = `https://webapi.115.com/files?aid=1&cid=${params.cid}&o=user_ptime&asc=0&offset=0&limit=200&show_dir=0`;
    const recentBody = await getJson(recentUrl, params.cookie);
    const recentRows = extractArray(recentBody).filter((row) => !isFolderRow(row));
    return exactMatch(recentRows);
  }
};
