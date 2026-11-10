import type { Waypoint } from './survey';

export interface MissionOptions {
  altitudeM: number;
  speedMs: number;
  gimbalPitchDeg: number;
  finishAction: 'goHome' | 'noAction';
  distanceM: number;
  durationS: number;
}

const HEADER =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">';

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// droneEnumValue 68 is what DJI Fly writes for its consumer waypoint missions.
function missionConfig(o: MissionOptions): string {
  return `    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${o.finishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>${fmt(o.speedMs)}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>68</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>`;
}

function actionGroup(groupId: number, index: number, action: string): string {
  return `        <wpml:actionGroup>
          <wpml:actionGroupId>${groupId}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>${index}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>${index}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
${action}
        </wpml:actionGroup>`;
}

function gimbalRotate(actionId: number, pitchDeg: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>${fmt(pitchDeg)}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function takePhoto(actionId: number): string {
  return `          <wpml:action>
            <wpml:actionId>${actionId}</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>`;
}

function placemark(wp: Waypoint, index: number, o: MissionOptions, ids: { group: number; action: number }): string {
  const groups = [actionGroup(ids.group++, index, gimbalRotate(ids.action++, o.gimbalPitchDeg))];
  if (wp.takePhoto) groups.push(actionGroup(ids.group++, index, takePhoto(ids.action++)));

  return `      <Placemark>
        <Point>
          <coordinates>${wp.lng.toFixed(8)},${wp.lat.toFixed(8)}</coordinates>
        </Point>
        <wpml:index>${index}</wpml:index>
        <wpml:executeHeight>${fmt(o.altitudeM)}</wpml:executeHeight>
        <wpml:waypointSpeed>${fmt(o.speedMs)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>0</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>1</wpml:useStraightLine>
${groups.join('\n')}
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${fmt(o.gimbalPitchDeg)}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>`;
}

/** wpmz/waylines.wpml: the route the aircraft executes. */
export function buildWaylines(waypoints: Waypoint[], o: MissionOptions): string {
  const ids = { group: 1, action: 1 };
  const placemarks = waypoints.map((wp, i) => placemark(wp, i, o, ids)).join('\n');
  return `${HEADER}
  <Document>
${missionConfig(o)}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>${fmt(o.distanceM)}</wpml:distance>
      <wpml:duration>${fmt(o.durationS)}</wpml:duration>
      <wpml:autoFlightSpeed>${fmt(o.speedMs)}</wpml:autoFlightSpeed>
${placemarks}
    </Folder>
  </Document>
</kml>
`;
}

/** wpmz/template.kml: DJI Fly writes only mission-level config here. */
export function buildTemplate(o: MissionOptions, nowMs: number = Date.now()): string {
  return `${HEADER}
  <Document>
    <wpml:author>fly</wpml:author>
    <wpml:createTime>${nowMs}</wpml:createTime>
    <wpml:updateTime>${nowMs}</wpml:updateTime>
${missionConfig(o)}
  </Document>
</kml>
`;
}
