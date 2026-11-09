// Interface layer: HTTP <-> use cases. No business rules here.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "../domain/entities.ts";
import type { ProgramUseCases } from "../application/programUseCases.ts";

const readJson = async (req: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
};

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

const bearer = (req: IncomingMessage): string | null => {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
};

export const createHttpServer = (uc: ProgramUseCases) =>
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const m = req.method ?? "GET";
      let g: RegExpMatchArray | null;
      const editor = () => uc.assertEditor(bearer(req));       // call before any write

      // ---- user actions
      if (m === "GET" && path === "/api/admin/users") {
  await uc.assertAdmin(bearer(req));
  return send(res, 200, await uc.listUsers());
}

if (m === "GET" && path === "/") {
  return send(res, 200, {
    status: "ok",
    message: "Karabuk Choir API is running",
  });
}

if (m === "GET" && path === "/health") {
  return send(res, 200, {
    status: "ok",
    service: "karabuk-choir-api",
  });
}

if (m === "POST" && path === "/api/admin/users") {
  await uc.assertAdmin(bearer(req));
  return send(res, 201, await uc.createUser(await readJson(req)));
}

if ((g = path.match(/^\/api\/admin\/users\/([^/]+)$/))) {
  if (m === "PUT") {
    await uc.assertAdmin(bearer(req));
    return send(res, 200, await uc.updateUser(g[1], await readJson(req)));
  }

  if (m === "DELETE") {
  await uc.assertAdmin(bearer(req));

  return send(
    res,
    200,
    await uc.deleteUser(bearer(req), g[1]),
  );
}
}

      // ---- accounts
      if (m === "POST" && path === "/api/login") {
        const b = await readJson(req);
        return send(res, 200, await uc.login(b.email, b.password));
      }
      if (m === "GET" && path === "/api/me") return send(res, 200, (await uc.whoami(bearer(req))) ?? {
  email: null,
  editor: false,
  admin: false
});

      // ---- public reads
      if (m === "GET" && path === "/api/preview-status") return send(res, 200, await uc.previewStatus());
      if (m === "GET" && path === "/api/sections") return send(res, 200, await uc.listSections());
      if (m === "GET" && path === "/api/stats") return send(res, 200, await uc.stats());

      if (m === "GET" && path === "/api/masses") {
        const limit = url.searchParams.get("limit");
        return send(res, 200, await uc.listMasses(limit ? +limit : undefined, url.searchParams.get("before") ?? undefined));
      }

      // ---- songs
      if (m === "GET" && path === "/api/songs") {
        const sec = url.searchParams.get("sectionId");
        return send(res, 200, await uc.searchSongs(url.searchParams.get("q") ?? "", sec ? +sec : undefined, url.searchParams.get("lyrics") === "1"));
      }
      if (m === "POST" && path === "/api/songs") {
        await editor();
        const song = await uc.createSong(await readJson(req));
        return send(res, 201, { id: song.id, sectionTypeId: song.sectionTypeId, title: song.title, melody: song.melody });
      }
      if ((g = path.match(/^\/api\/songs\/(\d+)$/))) {
        const id = +g[1];
        if (m === "GET") return send(res, 200, await uc.getSong(id));
        if (m === "PUT") {
          await editor();
          const song = await uc.updateSong(id, await readJson(req));
          return send(res, 200, { id: song.id, sectionTypeId: song.sectionTypeId, title: song.title, melody: song.melody });
        }
        if (m === "DELETE") {
          await editor();
          await uc.deleteSong(id);
          return send(res, 200, { deleted: id });
        }
      }

      // ---- programs
      if ((g = path.match(/^\/api\/masses\/([^/]+)\/program\.pdf$/)) && m === "GET") {
        const pdf = await uc.renderPdf(g[1], url.searchParams.get("community") ?? undefined);
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="programme_${g[1]}.pdf"` });
        return res.end(Buffer.from(pdf));
      }
      if ((g = path.match(/^\/api\/masses\/([^/]+)\/program\.docx$/)) && m === "GET") {
        const docx = await uc.renderWord(g[1], url.searchParams.get("community") ?? undefined);
        res.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="programme_${g[1]}.docx"`,
        });
        return res.end(Buffer.from(docx));
      }
      if ((g = path.match(/^\/api\/masses\/([^/]+)\/program$/)) && m === "GET") return send(res, 200, await uc.getProgram(g[1]));

      if ((g = path.match(/^\/api\/masses\/([^/]+)\/copy$/)) && m === "POST") {
        await editor();
        const b = await readJson(req);
        return send(res, 200, await uc.copyProgram(g[1], String(b.fromDate ?? "")));
      }
      if ((g = path.match(/^\/api\/masses\/([^/]+)\/sections\/(\d+)$/))) {
        if (m === "PUT") {
          await editor();
          const body = await readJson(req);
          return send(res, 200, await uc.setSection(g[1], +g[2], Number(body.songId), body.position ?? 1));
        }
        if (m === "DELETE") {
          await editor();
          const pos = url.searchParams.get("position");
          return send(res, 200, await uc.clearSection(g[1], +g[2], pos ? +pos : undefined));
        }
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      if (e instanceof UnauthorizedError) return send(res, 401, { error: e.message });
      if (e instanceof ForbiddenError) return send(res, 403, { error: e.message });
      if (e instanceof ConflictError) return send(res, 409, { error: e.message, existingId: e.existingId });
      if (e instanceof ValidationError) return send(res, 400, { error: e.message });
      if (e instanceof NotFoundError) return send(res, 404, { error: e.message });
      if (e instanceof SyntaxError) return send(res, 400, { error: "invalid JSON" });
      console.error(e);
      if (e instanceof Error && e.message.startsWith("Renderer responded"))
        return send(res, 502, { error: e.message });          // e.g. the Word template could not be converted
      send(res, 500, { error: "internal error" });
    }
  });