import { beforeEach, describe, expect, it } from 'vitest';
import { getOrgUrl, isOnboarded, useSettings } from './settings.store';

describe('settings.store', () => {
  beforeEach(() => {
    useSettings.getState().reset();
  });

  describe('actions', () => {
    it('starts with all fields null', () => {
      const s = useSettings.getState();
      expect(s.org).toBeNull();
      expect(s.pat).toBeNull();
      expect(s.projectId).toBeNull();
      expect(s.projectName).toBeNull();
      expect(s.teamId).toBeNull();
      expect(s.teamName).toBeNull();
    });

    it('setCredentials only updates org and pat (does not touch project/team)', () => {
      useSettings.getState().setProjectAndTeam('p1', 'Project One', 't1', 'Team One');
      useSettings.getState().setCredentials('myorg', 'pat-value');

      const s = useSettings.getState();
      expect(s.org).toBe('myorg');
      expect(s.pat).toBe('pat-value');
      expect(s.projectId).toBe('p1');
      expect(s.teamId).toBe('t1');
    });

    it('setProject clears the team selection (since team belongs to a project)', () => {
      useSettings.getState().setProjectAndTeam('p1', 'Project One', 't1', 'Team One');
      useSettings.getState().setProject('p2', 'Project Two');

      const s = useSettings.getState();
      expect(s.projectId).toBe('p2');
      expect(s.projectName).toBe('Project Two');
      expect(s.teamId).toBeNull();
      expect(s.teamName).toBeNull();
    });

    it('setTeam updates only team fields', () => {
      useSettings.getState().setProject('p1', 'Project One');
      useSettings.getState().setTeam('t1', 'Team One');

      const s = useSettings.getState();
      expect(s.projectId).toBe('p1');
      expect(s.teamId).toBe('t1');
      expect(s.teamName).toBe('Team One');
    });

    it('reset wipes every field back to null', () => {
      useSettings.getState().setCredentials('o', 'p');
      useSettings.getState().setProjectAndTeam('p', 'P', 't', 'T');
      useSettings.getState().reset();

      const s = useSettings.getState();
      expect(s.org).toBeNull();
      expect(s.pat).toBeNull();
      expect(s.projectId).toBeNull();
      expect(s.teamId).toBeNull();
    });
  });

  describe('isOnboarded', () => {
    it('is false when any required field is missing', () => {
      expect(isOnboarded(useSettings.getState())).toBe(false);
      useSettings.getState().setCredentials('o', 'p');
      expect(isOnboarded(useSettings.getState())).toBe(false);
      useSettings.getState().setProject('p', 'P');
      expect(isOnboarded(useSettings.getState())).toBe(false);
    });

    it('is true once org, pat, projectId, and teamId are all present', () => {
      useSettings.getState().setCredentials('o', 'p');
      useSettings.getState().setProjectAndTeam('p', 'P', 't', 'T');
      expect(isOnboarded(useSettings.getState())).toBe(true);
    });
  });

  describe('getOrgUrl', () => {
    it('returns null when org is unset', () => {
      expect(getOrgUrl(useSettings.getState())).toBeNull();
    });

    it('returns the dev.azure.com URL for the org, encoded', () => {
      useSettings.getState().setCredentials('my org', 'p');
      expect(getOrgUrl(useSettings.getState())).toBe('https://dev.azure.com/my%20org');
    });
  });
});
