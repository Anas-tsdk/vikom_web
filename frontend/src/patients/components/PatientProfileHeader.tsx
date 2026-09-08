import React from 'react';
import { Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { PatientDetailsDto } from '../types/patient';
import Avatar from '../../components/common/Avatar';
import StatTile from '../../components/common/StatTile';
import IconButton from '../../components/common/IconButton';
import Badge from '../../components/common/Badge';
import './PatientProfileHeader.css';

interface PatientProfileHeaderProps {
  patient: PatientDetailsDto;
  onCall: () => void;
  onEdit: () => void;
  /** When set, shows a "Fortsett besøk" shortcut to the active visit-execution page. */
  ongoingVisitHref?: string;
}

/**
 * Full-width patient profile header: avatar, name, inline contact chips,
 * an at-a-glance KPI strip and the primary actions (Ring pasient / Rediger).
 */
const PatientProfileHeader: React.FC<PatientProfileHeaderProps> = ({ patient, onCall, onEdit, ongoingVisitHref }) => {
  const contactChips = [
    { icon: 'envelope', value: patient.email },
    { icon: 'telephone', value: patient.phoneNumber },
    { icon: 'geo-alt', value: patient.address },
  ].filter((chip) => chip.value);

  return (
    <div className="vk-profile-header border-dark">
      <div className="vk-profile-header-top">
        <div className="vk-profile-identity">
          <Avatar name={patient.fullName} size="lg" />
          <div className="vk-profile-identity-text">
            <p className="vk-profile-eyebrow">Profil</p>
            <h1 className="vk-profile-name">{patient.fullName}</h1>
            <div className="vk-profile-chips">
              {/* <Badge bg="secondary">Pasient</Badge> */}
              {contactChips.map((chip) => (
                <Badge key={chip.icon} icon={chip.icon} bg="light" bordered>
                  {chip.value}
                </Badge>
              ))}
              {/* Whether this patient can be reached on the TV at all: without a
                  Supabase link the TV app cannot resolve them. */}
              <Badge
                icon="tv"
                bg={patient.supabaseProfileId ? 'connected' : 'light'}
                bordered={!patient.supabaseProfileId}
              >
                {patient.supabaseProfileId ? 'TV tilkoblet' : 'Ingen TV-kobling'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="vk-profile-actions">
          {ongoingVisitHref && (
            <Link to={ongoingVisitHref} className="btn btn-success">
              <i className="bi bi-box-arrow-in-right me-2" aria-hidden="true"></i>
              Fortsett besøk
            </Link>
          )}
          <Button variant="primary" onClick={onCall}>
            <i className="bi bi-telephone-outbound me-2" aria-hidden="true"></i>
            Ring pasient
          </Button>
          <IconButton icon="pencil" title="Rediger" onClick={onEdit} />
        </div>
      </div>

      <div className="vk-profile-stats">
        <StatTile icon="calendar2-week" label="Totalt antall avtaler" value={patient.totalAppointments} />
        <StatTile icon="calendar-event" label="Kommende avtaler" value={patient.upcomingAppointments.length} />
        <StatTile icon="clock-history" label="Tidligere avtaler" value={patient.pastAppointments.length} />
        <StatTile icon="calendar-check" label="Siste avtale" value={patient.lastAppointmentDate || 'Aldri'} />
      </div>
    </div>
  );
};

export default PatientProfileHeader;
