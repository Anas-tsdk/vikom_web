import React from 'react';
import { Row, Col } from 'react-bootstrap';
import DayCard from './DayCard';
import type { WeekAvailability, AvailabilityWindow } from '../types/availability';
import { parseISODate, getDayName, getDayNumber, isToday } from '../../utils/dateUtils';

interface WeeklyViewProps {
  weekData: WeekAvailability;
  onDayClick: (date: string, window?: AvailabilityWindow) => void;
}

const WeeklyView: React.FC<WeeklyViewProps> = ({ weekData, onDayClick }) => {
  return (
    <Row className="g-3">
      {weekData.days.map((dayData) => {
        const date = parseISODate(dayData.date);
        return (
          <Col key={dayData.date} xs={12} sm={6} md={4} lg className="d-flex">
            <DayCard
              dayData={dayData}
              dayName={getDayName(date)}
              dayNumber={getDayNumber(date)}
              isToday={isToday(date)}
              onClick={onDayClick}
            />
          </Col>
        );
      })}
    </Row>
  );
};

export default WeeklyView;
