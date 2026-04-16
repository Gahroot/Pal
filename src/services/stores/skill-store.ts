import { homeDir, join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { v4 as uuidv4 } from 'uuid';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// ─── YAML Frontmatter Parser ─────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!raw.startsWith('---')) {
    return { meta, body: raw };
  }

  const endIdx = raw.indexOf('---', 3);
  if (endIdx === -1) {
    return { meta, body: raw };
  }

  const frontmatter = raw.slice(3, endIdx).trim();
  const body = raw.slice(endIdx + 3).trim();

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  return { meta, body };
}

// ─── Store ───────────────────────────────────────────────────────────────────

class SkillStore {
  private skills: Skill[] = [];
  private skillsDir = '';

  async init(): Promise<void> {
    const home = await homeDir();
    this.skillsDir = await join(home, 'Documents', 'Tama', '.gg', 'skills');
    if (!(await exists(this.skillsDir))) {
      await mkdir(this.skillsDir, { recursive: true });
    }
    this.skills = await this.loadAllFromDisk();
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async save(skill: Skill): Promise<void> {
    skill.updatedAt = Date.now();
    const fileName = `${skill.name}.md`;
    const filePath = await join(this.skillsDir, fileName);

    const frontmatter = [
      '---',
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      '---',
    ].join('\n');
    const fileContent = `${frontmatter}\n\n${skill.content}`;
    await writeTextFile(filePath, fileContent);

    const idx = this.skills.findIndex((s) => s.id === skill.id);
    if (idx >= 0) {
      this.skills[idx] = skill;
    } else {
      this.skills.push(skill);
    }
  }

  async loadAll(): Promise<Skill[]> {
    return [...this.skills];
  }

  skill(id: string): Skill | undefined {
    return this.skills.find((s) => s.id === id);
  }

  async delete(id: string): Promise<void> {
    const skill = this.skills.find((s) => s.id === id);
    if (!skill) return;

    const filePath = await join(this.skillsDir, `${skill.name}.md`);
    if (await exists(filePath)) {
      await remove(filePath);
    }
    this.skills = this.skills.filter((s) => s.id !== id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  createSkill(name: string, description: string, content: string): Skill {
    const now = Date.now();
    return {
      id: uuidv4(),
      name,
      description,
      content,
      createdAt: now,
      updatedAt: now,
    };
  }

  formatForPrompt(): string {
    if (this.skills.length === 0) return '';

    const lines = ['Available skills:'];
    for (const skill of this.skills) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }
    return lines.join('\n');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async loadAllFromDisk(): Promise<Skill[]> {
    const entries = await readDir(this.skillsDir);
    const skills: Skill[] = [];
    for (const entry of entries) {
      if (entry.name?.endsWith('.md')) {
        try {
          const filePath = await join(this.skillsDir, entry.name);
          const raw = await readTextFile(filePath);
          const { meta, body } = parseFrontmatter(raw);

          const fallbackName = entry.name.replace(/\.md$/, '');
          const name = meta['name'] || fallbackName;
          const description = meta['description'] || '';

          skills.push({
            id: uuidv4(),
            name,
            description,
            content: body,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        } catch {
          // skip corrupted files
        }
      }
    }
    return skills;
  }
}

export const skillStore = new SkillStore();
